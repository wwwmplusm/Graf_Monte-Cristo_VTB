import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { ErrorBanner } from "../ErrorBanner";
import { Shield, CreditCard, Receipt, Wallet } from "lucide-react";
import { getBanks } from "../../utils/api";

interface Bank {
  id: string;           // vbank, abank, sbank
  name: string;          // VBank, ABank, SBank
  connected: boolean;
  baseUrl?: string;
  status?: string;      // "configured" | "missing_url"
  error?: string;
}

interface BankConsents {
  account: boolean;
  product: boolean;
  payment: boolean;
}

interface BankConsentMatrix {
  bank_id: string;
  bank_name: string;
  selected: boolean;
  consents: BankConsents;
}

interface Step2BanksAndConsentsProps {
  onNext: (banks: BankConsentMatrix[]) => void;
  onBack: () => void;
  onboardingState: any;
  setOnboardingState: (updater: (prev: any) => any) => void;
}

type LoadingState = "idle" | "loading" | "error" | "empty" | "success";

export function Step2BanksAndConsents({
  onNext,
  onBack,
  onboardingState,
  setOnboardingState,
}: Step2BanksAndConsentsProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [banksData, setBanksData] = useState<BankConsentMatrix[]>([]);

  // Fetch banks from API
  const fetchBanks = async () => {
    setLoadingState("loading");

    try {
      const userId = onboardingState.user_id || undefined;
      const response = await getBanks(userId);
      const banks: Bank[] = response.banks || [];

      // Filter out banks without URL (not configured)
      const availableBanks = banks.filter((bank) => {
        // Only show banks that are configured (have URL)
        return bank.status === "configured" || (bank.baseUrl && !bank.error);
      });

      // Log banks with errors for debugging
      const banksWithErrors = banks.filter((bank) => bank.error || bank.status === "missing_url");
      if (banksWithErrors.length > 0) {
        console.warn("Some banks are not configured:", banksWithErrors.map((b) => ({ id: b.id, name: b.name, error: b.error })));
      }

      // Update onboardingState with banks
      setOnboardingState((prev: any) => ({
        ...prev,
        banks: availableBanks,
      }));

      // Initialize banks data with consent checkboxes
      const initialBanksData: BankConsentMatrix[] = availableBanks.map((bank) => ({
        bank_id: bank.id,
        bank_name: bank.name,
        selected: false,
        consents: {
          account: false,
          product: false,
          payment: false,
        },
      }));

      setBanksData(initialBanksData);

      if (availableBanks.length === 0) {
        setLoadingState("empty");
      } else {
        setLoadingState("success");
      }
    } catch (error) {
      console.error("Failed to fetch banks:", error);
      setLoadingState("error");
    }
  };

  useEffect(() => {
    // Load banks if not already loaded
    if (onboardingState.banks.length === 0) {
      fetchBanks();
    } else {
      // Initialize from existing banks
      const initialBanksData: BankConsentMatrix[] = onboardingState.banks.map(
        (bank: Bank) => ({
          bank_id: bank.id,
          bank_name: bank.name,
          selected: false,
          consents: {
            account: false,
            product: false,
            payment: false,
          },
        })
      );
      setBanksData(initialBanksData);
      setLoadingState("success");
    }
  }, []);

  const handleBankSelect = (bankId: string, selected: boolean) => {
    setBanksData((prev) =>
      prev.map((bank) =>
        bank.bank_id === bankId ? { ...bank, selected } : bank
      )
    );
  };

  const handleConsentChange = (
    bankId: string,
    consentType: keyof BankConsents,
    checked: boolean
  ) => {
    setBanksData((prev) =>
      prev.map((bank) =>
        bank.bank_id === bankId
          ? {
              ...bank,
              consents: {
                ...bank.consents,
                [consentType]: checked,
              },
            }
          : bank
      )
    );
  };

  const handleSelectAllConsents = (bankId: string, checked: boolean) => {
    setBanksData((prev) =>
      prev.map((bank) =>
        bank.bank_id === bankId
          ? {
              ...bank,
              consents: {
                account: checked,
                product: checked,
                payment: checked,
              },
            }
          : bank
      )
    );
  };

  const areAllConsentsSelected = (bank: BankConsentMatrix): boolean => {
    return bank.consents.account && bank.consents.product && bank.consents.payment;
  };

  const validateSelection = (): boolean => {
    const selectedBanks = banksData.filter((bank) => bank.selected);
    if (selectedBanks.length === 0) return false;

    // Check that all selected banks have at least account consent (required)
    return selectedBanks.every((bank) => bank.consents.account);
  };

  const handleNext = () => {
    if (validateSelection()) {
      const selectedBanks = banksData.filter((bank) => bank.selected);
      onNext(selectedBanks);
    }
  };

  const canProceed = validateSelection();

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Выберите банки и согласия</h1>
        <p className="text-[var(--color-text-secondary)]">
          Выберите банки и необходимые типы согласий для каждого банка
        </p>
      </div>

      {/* Loading State */}
      {loadingState === "loading" && (
        <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {loadingState === "error" && (
        <div className="mb-6">
          <ErrorBanner
            message="Не удалось загрузить список банков"
            onRetry={fetchBanks}
          />
        </div>
      )}

      {/* Empty State */}
      {loadingState === "empty" && (
        <div className="text-center py-12 mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-secondary)] flex items-center justify-center">
            <span className="text-4xl">🏦</span>
          </div>
          <h2 className="mb-2">Банки недоступны</h2>
          <p className="text-[var(--color-text-secondary)] mb-6">
            Проверьте подключение к бэкенду
          </p>
          <Button
            variant="outline"
            onClick={fetchBanks}
            className="rounded-xl border-[var(--color-stroke-divider)]"
          >
            Повторить попытку
          </Button>
        </div>
      )}

      {/* Success State - Bank List with Consents */}
      {loadingState === "success" && (
        <div className="space-y-4 md:space-y-5 mb-6 md:mb-8">
          {banksData.map((bank) => (
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
                    {bank.bank_name}
                  </h3>
                </div>
                <Checkbox
                  checked={bank.selected}
                  onCheckedChange={(checked) =>
                    handleBankSelect(bank.bank_id, checked as boolean)
                  }
                  className="flex-shrink-0"
                />
              </div>

              {/* Consents */}
              {bank.selected && (
                <div className="ml-16 md:ml-18 space-y-3 pt-3 border-t border-[var(--color-stroke-divider)]">
                  {/* Select All Checkbox */}
                  <div className="flex items-center gap-3 pb-2 mb-2 border-b border-[var(--color-stroke-divider)]">
                    <Checkbox
                      id={`${bank.bank_id}-select-all`}
                      checked={areAllConsentsSelected(bank)}
                      onCheckedChange={(checked) =>
                        handleSelectAllConsents(bank.bank_id, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={`${bank.bank_id}-select-all`}
                      className="cursor-pointer text-[var(--color-text-primary)] font-medium"
                    >
                      Выбрать всё
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${bank.bank_id}-account`}
                      checked={bank.consents.account}
                      onCheckedChange={(checked) =>
                        handleConsentChange(
                          bank.bank_id,
                          "account",
                          checked as boolean
                        )
                      }
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`${bank.bank_id}-account`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)]">
                          Доступ к счетам, балансам и транзакциям
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          (обязательно)
                        </span>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${bank.bank_id}-product`}
                      checked={bank.consents.product}
                      onCheckedChange={(checked) =>
                        handleConsentChange(
                          bank.bank_id,
                          "product",
                          checked as boolean
                        )
                      }
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`${bank.bank_id}-product`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)]">
                          Доступ к информации о продуктах (кредиты, вклады)
                        </span>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${bank.bank_id}-payment`}
                      checked={bank.consents.payment}
                      onCheckedChange={(checked) =>
                        handleConsentChange(
                          bank.bank_id,
                          "payment",
                          checked as boolean
                        )
                      }
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`${bank.bank_id}-payment`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-[var(--color-brand-primary)]" />
                        <span className="text-[var(--color-text-primary)]">
                          Разрешение на платежи (MDP/ADP/SDP)
                        </span>
                      </div>
                    </Label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Validation Message */}
      {loadingState === "success" && !canProceed && banksData.some((b) => b.selected) && (
        <div className="mb-6 p-4 bg-[var(--color-warning-light)] border border-[var(--color-warning)] rounded-xl">
          <p className="text-sm text-[var(--color-text-primary)]">
            Для всех выбранных банков необходимо выбрать доступ к счетам, балансам и транзакциям
          </p>
        </div>
      )}

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
          onClick={handleNext}
          disabled={!canProceed || loadingState !== "success"}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Продолжить
        </Button>
      </div>
    </div>
  );
}

