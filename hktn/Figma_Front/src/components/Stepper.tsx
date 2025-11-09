import { Check } from "lucide-react";

interface StepperProps {
  currentStep: number;
  totalSteps: number;
}

export function Stepper({ currentStep, totalSteps }: StepperProps) {
  return (
    <div className="w-full">
      {/* Progress Bar */}
      <div className="relative h-1 bg-[var(--color-stroke-divider)] rounded-full overflow-hidden mb-6">
        <div
          className="absolute top-0 left-0 h-full bg-[var(--color-brand-primary)] transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between items-center">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div key={stepNumber} className="flex flex-col items-center gap-2 flex-1">
              <div
                className={`
                  w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-300
                  ${
                    isCompleted
                      ? "bg-[var(--color-brand-primary)] text-white"
                      : isCurrent
                      ? "bg-[var(--color-brand-primary)] text-white ring-4 ring-[var(--color-brand-primary-light)] ring-opacity-30"
                      : "bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]"
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <span className="caption md:text-sm">{stepNumber}</span>
                )}
              </div>
              <span className="caption text-[var(--color-text-secondary)] text-center hidden md:block">
                Шаг {stepNumber}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
