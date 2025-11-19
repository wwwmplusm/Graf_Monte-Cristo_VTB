import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { ErrorBanner } from "../ErrorBanner";
import { Shield, Receipt, Wallet, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { createOnboardingConsents, getConsentsStatus, ConsentProgressStatus } from "../../utils/api";

interface BankConsentMatrix {
  bank_id: string;
  bank_name: string;
  selected: boolean;
  consents: {
    account: boolean;
    product: boolean;
    payment: boolean;
  };
}

interface Step2ConsentProgressProps {
  onNext: () => void;
  onBack: () => void;
  banksWithConsents: BankConsentMatrix[];
  userId: string;
}

type ConsentStatusType = "creating" | "pending" | "approved" | "error";

function getStatusIcon(status?: ConsentStatusType) {
  if (!status) return null;
  
  switch (status) {
    case "approved":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "error":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "pending":
      return <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />;
    case "creating":
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return null;
  }
}

function getStatusText(status?: ConsentStatusType) {
  if (!status) return "Не создано";
  
  switch (status) {
    case "approved":
      return "Успешно";
    case "error":
      return "Ошибка";
    case "pending":
      return "Ожидание подтверждения";
    case "creating":
      return "Создание...";
    default:
      return "Неизвестно";
  }
}

export function Step2ConsentProgress({
  onNext,
  onBack,
  banksWithConsents,
  userId,
}: Step2ConsentProgressProps) {
  const [consentsStatus, setConsentsStatus] = useState<ConsentProgressStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [polling, setPolling] = useState(true);
  const [overallStatus, setOverallStatus] = useState<string>("in_progress");

  // Calculate progress percentage
  const selectedBanks = banksWithConsents.filter((b) => b.selected);
  const totalConsents = selectedBanks.reduce((sum, bank) => {
    let count = 0;
    if (bank.consents.account) count++;
    if (bank.consents.product) count++;
    if (bank.consents.payment) count++;
    return sum + count;
  }, 0);

  const approvedConsents = consentsStatus.reduce((sum, bank) => {
    let count = 0;
    if (bank.account_consent?.status === "approved") count++;
    if (bank.product_consent?.status === "approved") count++;
    if (bank.payment_consent?.status === "approved") count++;
    return sum + count;
  }, 0);

  const progressPercentage = totalConsents > 0 ? (approvedConsents / totalConsents) * 100 : 0;

  // Check if all required consents (account) are approved
  const allAccountConsentsApproved = selectedBanks.every((bank) => {
    const status = consentsStatus.find((s) => s.bank_id === bank.bank_id);
    return status?.account_consent?.status === "approved";
  });

  // Initial creation of consents
  useEffect(() => {
    const createConsents = async () => {
      setLoading(true);
      setError("");

      try {
        const banksData = selectedBanks.map((bank) => ({
          bank_id: bank.bank_id,
          consents: bank.consents,
        }));

        const response = await createOnboardingConsents(userId, banksData);
        setConsentsStatus(response.results);
        setOverallStatus(response.overall_status);

        // If all are completed, stop polling
        if (response.overall_status === "completed") {
          setPolling(false);
        }
      } catch (err: any) {
        setError(err.message || "Не удалось создать согласия");
        setPolling(false);
      } finally {
        setLoading(false);
      }
    };

    if (selectedBanks.length > 0) {
      createConsents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling for status updates
  useEffect(() => {
    if (!polling || selectedBanks.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const status = await getConsentsStatus(userId);
        setConsentsStatus(status);

        // Check if all account consents are approved
        const allApproved = selectedBanks.every((bank) => {
          const bankStatus = status.find((s) => s.bank_id === bank.bank_id);
          return bankStatus?.account_consent?.status === "approved";
        });

        // Check if there are any pending consents
        const hasPending = status.some((bank) => {
          return (
            bank.account_consent?.status === "pending" ||
            bank.product_consent?.status === "pending" ||
            bank.payment_consent?.status === "pending" ||
            bank.account_consent?.status === "creating" ||
            bank.product_consent?.status === "creating" ||
            bank.payment_consent?.status === "creating"
          );
        });

        if (allApproved && !hasPending) {
          setPolling(false);
          setOverallStatus("completed");
        }
      } catch (err) {
        console.error("Failed to poll consents status:", err);
        // Don't stop polling on error, just log it
      }
    }, 2500); // Poll every 2.5 seconds

    return () => clearInterval(interval);
  }, [polling, userId, selectedBanks]);

  const handleContinue = () => {
    if (allAccountConsentsApproved) {
      onNext();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Создание согласий</h1>
        <p className="text-[var(--color-text-secondary)]">
          Подождите, пока мы создадим необходимые согласия с банками
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 md:mb-8">
        <div className="relative h-2 bg-[var(--color-stroke-divider)] rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-[var(--color-brand-primary)] transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-[var(--color-text-secondary)]">
          <span>Прогресс: {approvedConsents} из {totalConsents}</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6">
          <ErrorBanner
            message={error}
            onRetry={() => {
              setError("");
              setPolling(true);
              // Retry creation
              const banksData = selectedBanks.map((bank) => ({
                bank_id: bank.bank_id,
                consents: bank.consents,
              }));
              createOnboardingConsents(userId, banksData)
                .then((response) => {
                  setConsentsStatus(response.results);
                  setOverallStatus(response.overall_status);
                })
                .catch((err) => setError(err.message || "Не удалось создать согласия"));
            }}
          />
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 mx-auto mb-4 text-[var(--color-brand-primary)] animate-spin" />
          <p className="text-[var(--color-text-secondary)]">Создание согласий...</p>
        </div>
      )}

      {/* Consents Status List */}
      {!loading && (
        <div className="space-y-4 md:space-y-5 mb-6 md:mb-8">
          {selectedBanks.map((bank) => {
            const status = consentsStatus.find((s) => s.bank_id === bank.bank_id);
            const bankName = status?.bank_name || bank.bank_name;

            return (
              <div
                key={bank.bank_id}
                className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6"
              >
                {/* Bank Header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl md:text-2xl">🏦</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[var(--color-text-primary)] font-medium">
                      {bankName}
                    </h3>
                  </div>
                </div>

                {/* Consents List */}
                <div className="ml-16 md:ml-18 space-y-3">
                  {/* Account Consent */}
                  {bank.consents.account && (
                    <div className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <Shield className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)] text-sm">
                          Доступ к счетам, балансам и транзакциям
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status?.account_consent?.status)}
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {getStatusText(status?.account_consent?.status)}
                        </span>
                        {status?.account_consent?.approval_url && (
                          <a
                            href={status.account_consent.approval_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-[var(--color-brand-primary)] hover:underline flex items-center gap-1"
                          >
                            Подтвердить
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Product Consent */}
                  {bank.consents.product && (
                    <div className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <Receipt className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)] text-sm">
                          Доступ к информации о продуктах
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status?.product_consent?.status)}
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {getStatusText(status?.product_consent?.status)}
                        </span>
                        {status?.product_consent?.approval_url && (
                          <a
                            href={status.product_consent.approval_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-[var(--color-brand-primary)] hover:underline flex items-center gap-1"
                          >
                            Подтвердить
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment Consent */}
                  {bank.consents.payment && (
                    <div className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <Wallet className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)] text-sm">
                          Разрешение на платежи
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status?.payment_consent?.status)}
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {getStatusText(status?.payment_consent?.status)}
                        </span>
                        {status?.payment_consent?.approval_url && (
                          <a
                            href={status.payment_consent.approval_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-[var(--color-brand-primary)] hover:underline flex items-center gap-1"
                          >
                            Подтвердить
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Messages */}
                  {status?.account_consent?.error_message && (
                    <div className="text-xs text-red-500 mt-1">
                      {status.account_consent.error_message}
                    </div>
                  )}
                  {status?.product_consent?.error_message && (
                    <div className="text-xs text-red-500 mt-1">
                      {status.product_consent.error_message}
                    </div>
                  )}
                  {status?.payment_consent?.error_message && (
                    <div className="text-xs text-red-500 mt-1">
                      {status.payment_consent.error_message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="w-full md:w-auto h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
        >
          Назад
        </Button>
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={!allAccountConsentsApproved || loading}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {allAccountConsentsApproved ? "Продолжить" : "Ожидание подтверждения..."}
        </Button>
      </div>
    </div>
  );
}

