import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Slider } from "../ui/slider";
import { checkUserHasLoans, getTotalLoanAmount } from "../../utils/api";

type GoalType = "save" | "payoff";
type Speed = "conservative" | "optimal" | "fast";

interface Step5QuestionsProps {
  onNext: (goals: any) => void;
  onBack: () => void;
  initialGoals: any;
  userId: string;
}

interface QuestionData {
  goals: GoalType[];
  saveAmount?: number;
  saveSpeed?: Speed;
  payoffSpeed?: Speed;
}

const SPEED_OPTIONS: Speed[] = ["conservative", "optimal", "fast"];
const SPEED_LABELS: Record<Speed, string> = {
  conservative: "Консервативно",
  optimal: "Оптимально",
  fast: "Быстро",
};

export function Step5Questions({ onNext, onBack, initialGoals, userId }: Step5QuestionsProps) {
  const [step, setStep] = useState<"goal" | "save-input" | "save-result" | "payoff-input" | "payoff-result">("goal");
  const [hasLoans, setHasLoans] = useState<boolean | null>(null);
  const [loadingLoans, setLoadingLoans] = useState(true);
  
  // Map from API structure to UI structure
  const initialUIGoals: GoalType[] = [];
  if (initialGoals?.mode === "save" || initialGoals?.mode === "both") initialUIGoals.push("save");
  if (initialGoals?.mode === "close_loans" || initialGoals?.mode === "both") initialUIGoals.push("payoff");
  
  const [goals, setGoals] = useState<GoalType[]>(initialUIGoals);
  const [saveAmount, setSaveAmount] = useState<string>(initialGoals?.save_amount?.toString() || "");
  const [saveSpeed, setSaveSpeed] = useState<Speed>(initialGoals?.save_speed || "optimal");
  const [payoffSpeed, setPayoffSpeed] = useState<Speed>(initialGoals?.close_speed || "optimal");
  const [payoffLoans, setPayoffLoans] = useState<string[]>(initialGoals?.close_loan_ids || []);
  const [totalLoanAmount, setTotalLoanAmount] = useState<number>(0);
  const [loadingLoanAmount, setLoadingLoanAmount] = useState<boolean>(true);

  // Check for loans and load total amount on mount
  useEffect(() => {
    const checkLoans = async () => {
      if (userId) {
        try {
          const [hasLoansResult, totalAmount] = await Promise.all([
            checkUserHasLoans(userId),
            getTotalLoanAmount(userId),
          ]);
          setHasLoans(hasLoansResult);
          setTotalLoanAmount(totalAmount);
        } catch (error) {
          console.error("Failed to check loans:", error);
          setHasLoans(false); // Default to false on error
          setTotalLoanAmount(0); // Default to 0 on error
        } finally {
          setLoadingLoans(false);
          setLoadingLoanAmount(false);
        }
      } else {
        setLoadingLoans(false);
        setLoadingLoanAmount(false);
        setHasLoans(false);
        setTotalLoanAmount(0);
      }
    };

    checkLoans();
  }, [userId]);

  // Generate random results based on speed
  const getSaveResults = (speed: Speed) => {
    const speedMultipliers = { conservative: 1, optimal: 1.5, fast: 2 };
    const multiplier = speedMultipliers[speed];
    return {
      percentageFaster: Math.floor(15 * multiplier + Math.random() * 10),
      monthsFaster: Math.floor(3 * multiplier + Math.random() * 2),
    };
  };

  const getPayoffResults = (speed: Speed) => {
    const speedMultipliers = { conservative: 1, optimal: 1.5, fast: 2 };
    const multiplier = speedMultipliers[speed];
    return {
      moneySaved: Math.floor((20000 + Math.random() * 30000) * multiplier),
      monthsFaster: Math.floor(3 * multiplier + Math.random() * 2),
    };
  };

  const handleGoalToggle = (goal: GoalType) => {
    // Allow toggling both goals (changed from radio behavior)
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const handleGoalNext = () => {
    if (goals.includes("save")) {
      setStep("save-input");
    } else if (goals.includes("payoff")) {
      setStep("payoff-input");
    }
  };

  const handleCalculateSave = () => {
    if (goals.includes("payoff")) {
      // If both goals, go to payoff after save
      setStep("payoff-input");
    } else {
      setStep("save-result");
    }
  };

  const handleCalculatePayoff = () => {
    setStep("payoff-result");
  };

  const handleComplete = () => {
    // Map to API structure
    let mode: "save" | "close_loans" | "both" | null = null;
    
    if (goals.includes("save") && goals.includes("payoff")) {
      mode = "both";
    } else if (goals.includes("save")) {
      mode = "save";
    } else if (goals.includes("payoff")) {
      mode = "close_loans";
    }

    const goalsData = {
      mode,
      save_amount: goals.includes("save") ? parseFloat(saveAmount) : null,
      save_speed: goals.includes("save") ? saveSpeed : null,
      close_loan_ids: goals.includes("payoff") ? payoffLoans : [],
      close_speed: goals.includes("payoff") ? payoffSpeed : null,
    };

    // In real app: POST /api/goals
    // Body: { user_id, mode, save: {...}, close: {...} }
    
    onNext(goalsData);
  };

  // Goal Selection Screen
  if (step === "goal") {
    // Show loading state while checking loans
    if (loadingLoans) {
      return (
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6 md:mb-8">
            <h1 className="mb-3 md:mb-4">Проверяем ваши данные...</h1>
            <p className="text-[var(--color-text-secondary)]">
              Это поможет нам предложить подходящие цели
            </p>
          </div>
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-brand-primary)]"></div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="mb-3 md:mb-4">Какая у тебя цель?</h1>
          <p className="text-[var(--color-text-secondary)]">
            Это поможет нам создать персональный план
          </p>
        </div>

        <div className="space-y-3 mb-6 md:mb-8">
          <div
            onClick={() => handleGoalToggle("save")}
            className={`
              w-full p-4 md:p-6 rounded-xl border-2 transition-all cursor-pointer
              ${
                goals.includes("save")
                  ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] bg-opacity-5"
                  : "border-[var(--color-stroke-divider)] hover:border-[var(--color-brand-primary-light)]"
              }
            `}
          >
            <div className="flex items-center gap-3">
              <Checkbox
                checked={goals.includes("save")}
                onCheckedChange={() => handleGoalToggle("save")}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-[var(--color-text-primary)] mb-1">Хочу накопить денег</p>
                <p className="caption text-[var(--color-text-secondary)]">
                  Создадим план накоплений
                </p>
              </div>
            </div>
          </div>

          {hasLoans ? (
            <div
              onClick={() => handleGoalToggle("payoff")}
              className={`
                w-full p-4 md:p-6 rounded-xl border-2 transition-all cursor-pointer
                ${
                  goals.includes("payoff")
                    ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] bg-opacity-5"
                    : "border-[var(--color-stroke-divider)] hover:border-[var(--color-brand-primary-light)]"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={goals.includes("payoff")}
                  onCheckedChange={() => handleGoalToggle("payoff")}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🎯</span>
                </div>
                <div>
                  <p className="text-[var(--color-text-primary)] mb-1">Закрыть кредит(ы)</p>
                  <p className="caption text-[var(--color-text-secondary)]">
                    Поможем быстрее избавиться от долгов
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full p-4 md:p-6 rounded-xl border-2 border-[var(--color-stroke-divider)] bg-[var(--color-bg-secondary)] opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-secondary)] flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🎯</span>
                </div>
                <div>
                  <p className="text-[var(--color-text-secondary)] mb-1">Закрыть кредит(ы)</p>
                  <p className="caption text-[var(--color-text-tertiary)]">
                    У вас нет активных кредитов. Начните копить деньги!
                  </p>
                </div>
              </div>
            </div>
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
            onClick={handleGoalNext}
            disabled={goals.length === 0}
            className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
          >
            Далее
          </Button>
        </div>
      </div>
    );
  }

  // Save Input Screen
  if (step === "save-input") {
    const speedIndex = SPEED_OPTIONS.indexOf(saveSpeed);

    return (
      <div className="w-full max-w-md mx-auto">
        {/* Amount Input Section */}
        <div className="mb-8 md:mb-12">
          <div className="text-center mb-6">
            <h2 className="mb-3">Сколько вы хотите заработать?</h2>
          </div>
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
            <Label htmlFor="save-amount" className="text-[var(--color-text-primary)] mb-3 block">
              Целевая сумма
            </Label>
            <div className="relative">
              <Input
                id="save-amount"
                type="number"
                placeholder="100000"
                value={saveAmount}
                onChange={(e) => setSaveAmount(e.target.value)}
                className="h-14 md:h-16 rounded-xl border-[var(--color-stroke-input)] bg-[var(--color-bg-primary)] pr-12 text-center"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
                ₽
              </span>
            </div>
          </div>
        </div>

        {/* Speed Selection Section */}
        <div className="mb-8 md:mb-12">
          <div className="text-center mb-6">
            <h2 className="mb-2">Как быстро вы хотите накопить?</h2>
          </div>
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
            <div className="mb-6">
              <Slider
                value={[speedIndex]}
                onValueChange={(values) => setSaveSpeed(SPEED_OPTIONS[values[0]])}
                max={2}
                step={1}
                className="mb-4"
              />
              <div className="flex justify-between text-[var(--color-text-secondary)] caption">
                {SPEED_OPTIONS.map((speed) => (
                  <span
                    key={speed}
                    className={saveSpeed === speed ? "text-[var(--color-brand-primary)]" : ""}
                  >
                    {SPEED_LABELS[speed]}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[var(--color-text-primary)]">{SPEED_LABELS[saveSpeed]}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setStep("goal")}
            className="w-full md:w-auto h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
          >
            Назад
          </Button>
          <Button
            size="lg"
            onClick={handleCalculateSave}
            disabled={!saveAmount || parseFloat(saveAmount) <= 0}
            className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
          >
            {goals.includes("payoff") ? "Далее" : "Рассчитать"}
          </Button>
        </div>
      </div>
    );
  }

  // Payoff Input Screen
  if (step === "payoff-input") {
    const speedIndex = SPEED_OPTIONS.indexOf(payoffSpeed);

    return (
      <div className="w-full max-w-md mx-auto">
        {/* Total Loans Section */}
        <div className="mb-8 md:mb-12">
          <div className="text-center mb-6">
            <h2 className="mb-3">Общая сумма кредитов</h2>
          </div>
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
            <div className="text-center">
              {loadingLoanAmount ? (
                <p className="text-[var(--color-text-secondary)]">Загрузка...</p>
              ) : (
                <p className="text-[var(--color-text-primary)]">
                  {totalLoanAmount.toLocaleString('ru-RU')} ₽
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Speed Selection Section */}
        <div className="mb-8 md:mb-12">
          <div className="text-center mb-6">
            <h2 className="mb-2">Как быстро вы хотите закрыть кредит(ы)?</h2>
          </div>
          <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
            <div className="mb-6">
              <Slider
                value={[speedIndex]}
                onValueChange={(values) => setPayoffSpeed(SPEED_OPTIONS[values[0]])}
                max={2}
                step={1}
                className="mb-4"
              />
              <div className="flex justify-between text-[var(--color-text-secondary)] caption">
                {SPEED_OPTIONS.map((speed) => (
                  <span
                    key={speed}
                    className={payoffSpeed === speed ? "text-[var(--color-brand-primary)]" : ""}
                  >
                    {SPEED_LABELS[speed]}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[var(--color-text-primary)]">{SPEED_LABELS[payoffSpeed]}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => goals.includes("save") ? setStep("save-input") : setStep("goal")}
            className="w-full md:w-auto h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
          >
            Назад
          </Button>
          <Button
            size="lg"
            onClick={handleCalculatePayoff}
            className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
          >
            Рассчитать
          </Button>
        </div>
      </div>
    );
  }

  // Combined Results Screen
  if (step === "save-result" || step === "payoff-result") {
    const saveResults = goals.includes("save") ? getSaveResults(saveSpeed) : null;
    const payoffResults = goals.includes("payoff") ? getPayoffResults(payoffSpeed) : null;

    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="mb-3">
            {goals.length === 2 
              ? "Ваш комплексный финансовый план готов" 
              : goals.includes("save") 
                ? "Ваши сбережения растут быстрее с нами"
                : "Ваш путь к финансовой свободе ускоряется"
            }
          </h1>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12">
          {/* Save Results */}
          {saveResults && (
            <>
              <div className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-purple-800/10 border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center">
                    <span className="text-3xl">📈</span>
                  </div>
                  <p className="caption text-[var(--color-text-secondary)] mb-2">
                    Скорость накопления
                  </p>
                  <p className="text-[var(--color-text-primary)] mb-1">
                    Заработайте на {saveResults.percentageFaster}% быстрее с нами
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-purple-800/10 border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center">
                    <span className="text-3xl">⏱️</span>
                  </div>
                  <p className="caption text-[var(--color-text-secondary)] mb-2">
                    Время до цели
                  </p>
                  <p className="text-[var(--color-text-primary)] mb-1">
                    На {saveResults.monthsFaster} {saveResults.monthsFaster === 1 ? 'месяц' : saveResults.monthsFaster < 5 ? 'месяца' : 'месяцев'} быстрее
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Payoff Results */}
          {payoffResults && (
            <>
              <div className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-purple-800/10 border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center">
                    <span className="text-3xl">💵</span>
                  </div>
                  <p className="caption text-[var(--color-text-secondary)] mb-2">
                    Вы можете сэкономить
                  </p>
                  <p className="text-[var(--color-text-primary)] mb-1">
                    {payoffResults.moneySaved.toLocaleString('ru-RU')} ₽
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-purple-800/10 border border-[var(--color-stroke-divider)] rounded-2xl p-6 md:p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center">
                    <span className="text-3xl">⚡</span>
                  </div>
                  <p className="caption text-[var(--color-text-secondary)] mb-2">
                    Закроете быстрее
                  </p>
                  <p className="text-[var(--color-text-primary)] mb-1">
                    На {payoffResults.monthsFaster} {payoffResults.monthsFaster === 1 ? 'месяц' : payoffResults.monthsFaster < 5 ? 'месяца' : 'месяцев'} быстрее
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleComplete}
            className="w-full md:w-auto min-w-[200px] h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
          >
            Завершить
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
