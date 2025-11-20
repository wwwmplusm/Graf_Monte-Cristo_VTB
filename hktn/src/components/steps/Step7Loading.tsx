import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getDashboard } from "../../utils/api";

interface Step7LoadingProps {
  onComplete: () => void;
  userId: string;
}

export function Step7Loading({ onComplete, userId }: Step7LoadingProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Инициализация...");

  useEffect(() => {
    // Simulate loading progress
    const steps = [
      { progress: 20, status: "Анализируем ваши финансы..." },
      { progress: 40, status: "Обрабатываем транзакции..." },
      { progress: 60, status: "Рассчитываем метрики..." },
      { progress: 80, status: "Формируем рекомендации..." },
      { progress: 100, status: "Готово!" },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setProgress(steps[currentStep].progress);
        setStatus(steps[currentStep].status);
        currentStep++;
      } else {
        clearInterval(interval);
        // Fetch dashboard data to trigger backend analysis
        getDashboard(userId)
          .then(() => {
            // Small delay before completing
            setTimeout(() => {
              onComplete();
            }, 500);
          })
          .catch((error) => {
            console.error("Failed to fetch dashboard:", error);
            // Complete anyway even if dashboard fails
            setTimeout(() => {
              onComplete();
            }, 500);
          });
      }
    }, 800);

    return () => clearInterval(interval);
  }, [userId, onComplete]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8 md:mb-12">
        <h1 className="mb-3 md:mb-4">Мы анализируем ваши финансы</h1>
        <p className="text-[var(--color-text-secondary)]">
          Это займет несколько секунд
        </p>
      </div>

      <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-8 md:p-12">
        <div className="flex flex-col items-center justify-center space-y-6">
          {/* Spinner */}
          <div className="relative">
            <Loader2 className="w-16 h-16 text-[var(--color-brand-primary)] animate-spin" />
          </div>

          {/* Status Text */}
          <div className="text-center">
            <p className="text-[var(--color-text-primary)] font-medium mb-2">
              {status}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full">
            <div className="relative h-2 bg-[var(--color-stroke-divider)] rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-[var(--color-brand-primary)] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm text-[var(--color-text-secondary)]">
              <span>Прогресс</span>
              <span>{progress}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

