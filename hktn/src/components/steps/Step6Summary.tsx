import { useState } from "react";
import { Button } from "../ui/button";
import { Shield, CreditCard, Receipt, Wallet, Target, TrendingUp, Loader2 } from "lucide-react";
import { finalizeOnboarding } from "../../utils/api";

interface Step6SummaryProps {
  onNext: () => void;
  onBack: () => void;
  onboardingState: {
    user_id: string;
    user_name: string;
    banks: Array<{ id: string; name: string }>;
    selected_bank_ids: string[];
    banks_with_consents?: Array<{
      bank_id: string;
      bank_name: string;
      consents: {
        account: boolean;
        product: boolean;
        payment: boolean;
      };
    }>;
    selected_products: Array<{
      bank_id: string;
      product_id: string;
      product_type: string;
      name?: string;
    }>;
    goals: {
      mode?: "save" | "close_loans" | "both" | null;
      save_amount?: number;
      save_speed?: "conservative" | "optimal" | "fast";
      close_loan_ids?: string[];
      close_speed?: "conservative" | "optimal" | "fast";
    };
  };
}

const SPEED_LABELS: Record<string, string> = {
  conservative: "Консервативно",
  optimal: "Оптимально",
  fast: "Быстро",
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  save: "Накопление денег",
  close_loans: "Закрытие кредитов",
  both: "Накопление и закрытие кредитов",
};

export function Step6Summary({
  onNext,
  onBack,
  onboardingState,
}: Step6SummaryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const selectedBanks = onboardingState.banks.filter((bank) =>
    onboardingState.selected_bank_ids?.includes(bank.id)
  );

  const handleFinalize = async () => {
    setLoading(true);
    setError("");

    try {
      // Use user_id as onboarding_id for simplicity
      await finalizeOnboarding(onboardingState.user_id, onboardingState.user_id);
      onNext();
    } catch (err: any) {
      setError(err.message || "Не удалось завершить онбординг");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Проверьте настройки</h1>
        <p className="text-[var(--color-text-secondary)]">
          Убедитесь, что все настройки верны перед завершением онбординга
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-4 md:space-y-5 mb-6 md:mb-8">
        {/* Connected Banks */}
        <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
          <h2 className="text-[var(--color-text-primary)] font-medium mb-4 flex items-center gap-2">
            <span className="text-xl">🏦</span>
            Подключенные банки
          </h2>
          <div className="space-y-2">
            {selectedBanks.map((bank) => {
              const bankConsents = onboardingState.banks_with_consents?.find(
                (b) => b.bank_id === bank.id
              );

              return (
                <div
                  key={bank.id}
                  className="p-3 bg-[var(--color-bg-secondary)] rounded-xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[var(--color-text-primary)] font-medium">
                      {bank.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {bankConsents?.consents.account && (
                      <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                        <Shield className="w-3 h-3" />
                        <span>Счета</span>
                      </div>
                    )}
                    {bankConsents?.consents.product && (
                      <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                        <Receipt className="w-3 h-3" />
                        <span>Продукты</span>
                      </div>
                    )}
                    {bankConsents?.consents.payment && (
                      <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                        <Wallet className="w-3 h-3" />
                        <span>Платежи</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Products */}
        {onboardingState.selected_products && onboardingState.selected_products.length > 0 && (
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
            <h2 className="text-[var(--color-text-primary)] font-medium mb-4 flex items-center gap-2">
              <span className="text-xl">💳</span>
              Выбранные продукты
            </h2>
            <div className="space-y-2">
              {onboardingState.selected_products.map((product, index) => {
                const bank = selectedBanks.find((b) => b.id === product.bank_id);
                return (
                  <div
                    key={index}
                    className="p-3 bg-[var(--color-bg-secondary)] rounded-xl"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-primary)]">
                        {product.name || product.product_type}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {bank?.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Goals */}
        {onboardingState.goals?.mode && (
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
            <h2 className="text-[var(--color-text-primary)] font-medium mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-[var(--color-brand-primary)]" />
              Цели
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                  Тип цели
                </p>
                <p className="text-[var(--color-text-primary)]">
                  {GOAL_TYPE_LABELS[onboardingState.goals.mode] || onboardingState.goals.mode}
                </p>
              </div>

              {(onboardingState.goals.mode === "save" || onboardingState.goals.mode === "both") && (
                <>
                  {onboardingState.goals.save_amount && (
                    <div>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                        Целевая сумма
                      </p>
                      <p className="text-[var(--color-text-primary)] font-medium">
                        {onboardingState.goals.save_amount.toLocaleString("ru-RU")} ₽
                      </p>
                    </div>
                  )}
                  {onboardingState.goals.save_speed && (
                    <div>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                        Стратегия накопления
                      </p>
                      <p className="text-[var(--color-text-primary)]">
                        {SPEED_LABELS[onboardingState.goals.save_speed] || onboardingState.goals.save_speed}
                      </p>
                    </div>
                  )}
                </>
              )}

              {(onboardingState.goals.mode === "close_loans" || onboardingState.goals.mode === "both") && (
                <>
                  {onboardingState.goals.close_loan_ids && onboardingState.goals.close_loan_ids.length > 0 && (
                    <div>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                        Кредиты для закрытия
                      </p>
                      <p className="text-[var(--color-text-primary)]">
                        {onboardingState.goals.close_loan_ids.length} кредит(ов)
                      </p>
                    </div>
                  )}
                  {onboardingState.goals.close_speed && (
                    <div>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                        Стратегия закрытия
                      </p>
                      <p className="text-[var(--color-text-primary)]">
                        {SPEED_LABELS[onboardingState.goals.close_speed] || onboardingState.goals.close_speed}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={loading}
          className="w-full md:w-auto h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
        >
          Назад
        </Button>
        <Button
          size="lg"
          onClick={handleFinalize}
          disabled={loading}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Завершение...
            </>
          ) : (
            "Готово"
          )}
        </Button>
      </div>
    </div>
  );
}

