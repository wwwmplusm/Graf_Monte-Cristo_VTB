import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "../ui/button";
import { StatusChip } from "../StatusChip";
import { ErrorBanner } from "../ErrorBanner";

interface FinalSummaryProps {
  onComplete: () => void;
  onboardingState: any;
}

const speedLabels = {
  conservative: "Консервативно",
  optimal: "Оптимально",
  fast: "Быстро",
};

export function FinalSummary({
  onComplete,
  onboardingState,
}: FinalSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedBanks = onboardingState.banks.filter((b: any) => b.connected);
  
  // Count consented products
  const consentedProducts = Object.values(onboardingState.productsByBank)
    .flat()
    .filter((p: any) => p.consented);

  const goals = onboardingState.goals;
  const hasSaveGoal = goals.mode === "save" || goals.mode === "both";
  const hasCloseGoal = goals.mode === "close_loans" || goals.mode === "both";

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Simulate API call: POST /api/onboarding/commit
      // Body: { user_id, banks, products, goals }
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Mock random error for demonstration (10% chance)
      if (Math.random() < 0.1) {
        throw new Error("Ошибка сохранения данных");
      }

      // Success
      onComplete();
    } catch (err: any) {
      setError(err.message || "Не удалось завершить онбординг");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Success Icon */}
      <div className="text-center mb-6 md:mb-8">
        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-full bg-[var(--color-success-light)] flex items-center justify-center">
          <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-[var(--color-success)]" />
        </div>
        <h1 className="mb-2">Отлично, {onboardingState.user_name || "друг"}!</h1>
        <p className="text-[var(--color-text-secondary)]">
          Ваш персональный план готов
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={handleComplete} />
        </div>
      )}

      {/* Summary Cards */}
      <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
        {/* Banks */}
        <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
          <h2 className="mb-4">Подключенные банки</h2>
          <div className="flex flex-wrap gap-2">
            {connectedBanks.map((bank: any) => (
              <div
                key={bank.id}
                className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg"
              >
                <span className="text-lg">🏦</span>
                <span className="text-[var(--color-text-primary)]">{bank.name}</span>
                <StatusChip status="connected" label="" />
              </div>
            ))}
          </div>
        </div>

        {/* Products */}
        <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
          <h2 className="mb-4">Выбранные продукты</h2>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />
            <span>{consentedProducts.length} продуктов подключено</span>
          </div>
        </div>

        {/* Goals */}
        {goals.mode && (
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6">
            <h2 className="mb-4">
              {goals.mode === "both" ? "Ваши цели" : "Ваша цель"}
            </h2>
            <div className="space-y-4">
              {/* Save Goal */}
              {hasSaveGoal && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">💰</span>
                    <div>
                      <p className="text-[var(--color-text-primary)]">Накопить денег</p>
                      {goals.save_amount && (
                        <p className="caption text-[var(--color-text-secondary)]">
                          Целевая сумма: {goals.save_amount.toLocaleString("ru-RU")} ₽
                        </p>
                      )}
                    </div>
                  </div>
                  {goals.save_speed && (
                    <div className="ml-11 flex items-center gap-2">
                      <p className="caption text-[var(--color-text-secondary)]">
                        Темп: <span className="text-[var(--color-text-primary)]">{speedLabels[goals.save_speed]}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Separator if both goals */}
              {hasSaveGoal && hasCloseGoal && (
                <div className="border-t border-[var(--color-stroke-divider)]" />
              )}

              {/* Close Loans Goal */}
              {hasCloseGoal && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <p className="text-[var(--color-text-primary)]">Закрыть кредиты</p>
                      {goals.close_loan_ids?.length > 0 && (
                        <p className="caption text-[var(--color-text-secondary)]">
                          Выбрано кредитов: {goals.close_loan_ids.length}
                        </p>
                      )}
                    </div>
                  </div>
                  {goals.close_speed && (
                    <div className="ml-11 flex items-center gap-2">
                      <p className="caption text-[var(--color-text-secondary)]">
                        Темп: <span className="text-[var(--color-text-primary)]">{speedLabels[goals.close_speed]}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <Button
        size="lg"
        onClick={handleComplete}
        disabled={isSubmitting}
        className="w-full h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white disabled:opacity-50"
      >
        {isSubmitting ? "Сохранение..." : "Завершить онбординг"}
      </Button>
    </div>
  );
}
