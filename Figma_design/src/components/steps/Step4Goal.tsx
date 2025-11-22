import { useState } from "react";
import { Button } from "../ui/button";

interface Step4GoalProps {
  onNext: (goals: any) => void;
  onBack: () => void;
  initialGoals: any;
  hasDebts: boolean; // Передаем информацию о наличии долгов
}

export function Step4Goal({ onNext, onBack, initialGoals, hasDebts }: Step4GoalProps) {
  const [selectedGoal, setSelectedGoal] = useState<'close_debts' | 'save_money' | null>(
    initialGoals?.mode || null
  );

  const handleComplete = () => {
    if (!selectedGoal) return;

    const goalsData = {
      mode: selectedGoal,
      save_amount: selectedGoal === 'save_money' ? 100000 : null,
      save_speed: selectedGoal === 'save_money' ? 'balanced' : null,
      close_loan_ids: [],
      close_speed: selectedGoal === 'close_debts' ? 'balanced' : null,
    };

    onNext(goalsData);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Какая у вас цель?</h1>
        <p className="text-[var(--color-text-secondary)]">
          Это поможет нам создать персональный план
        </p>
      </div>

      <div className="space-y-3 mb-6 md:mb-8">
        {/* Кнопка "Закрыть кредиты" - доступна ТОЛЬКО если есть кредиты */}
        {hasDebts && (
          <button
            onClick={() => setSelectedGoal('close_debts')}
            className={`
              w-full p-4 md:p-6 rounded-xl border-2 transition-all cursor-pointer text-left
              ${
                selectedGoal === 'close_debts'
                  ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] bg-opacity-5"
                  : "border-[var(--color-stroke-divider)] hover:border-[var(--color-brand-primary-light)]"
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-[var(--color-text-primary)] mb-1">Закрыть кредиты</p>
                <p className="caption text-[var(--color-text-secondary)]">
                  Поможем быстрее избавиться от долгов
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Кнопка "Накопить на цель" - доступна ТОЛЬКО если НЕТ кредитов */}
        {!hasDebts && (
          <button
            onClick={() => setSelectedGoal('save_money')}
            className={`
              w-full p-4 md:p-6 rounded-xl border-2 transition-all cursor-pointer text-left
              ${
                selectedGoal === 'save_money'
                  ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] bg-opacity-5"
                  : "border-[var(--color-stroke-divider)] hover:border-[var(--color-brand-primary-light)]"
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-[var(--color-text-primary)] mb-1">Накопить на цель</p>
                <p className="caption text-[var(--color-text-secondary)]">
                  Создадим план накоплений
                </p>
              </div>
            </div>
          </button>
        )}
      </div>

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
          onClick={handleComplete}
          disabled={!selectedGoal}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
        >
          Готово
        </Button>
      </div>
    </div>
  );
}
