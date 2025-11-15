import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";
import { ErrorBanner } from "../ErrorBanner";
import { Skeleton } from "../ui/skeleton";

interface CallbackScreenProps {
  bankId: string;
  consentId: string;
  userId: string;
  onComplete: (bankId: string, consentId: string) => void;
}

type CallbackState = "checking" | "approved" | "error";

export function CallbackScreen({ bankId, consentId, userId, onComplete }: CallbackScreenProps) {
  const [state, setState] = useState<CallbackState>("checking");
  const [errorMessage, setErrorMessage] = useState("");

  // Check consent status
  // In real app: GET /api/consents/status?user_id=xxx&consent_id=xxx
  const checkConsentStatus = async () => {
    setState("checking");
    setErrorMessage("");

    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mock response - in real app would check actual status
      const mockApproved = Math.random() > 0.1; // 90% success rate

      if (mockApproved) {
        setState("approved");
        // Auto-advance after showing success
        setTimeout(() => {
          onComplete(bankId, consentId);
        }, 1500);
      } else {
        setErrorMessage("Банк отклонил запрос на доступ");
        setState("error");
      }
    } catch (error) {
      setErrorMessage("Не удалось проверить статус согласия");
      setState("error");
    }
  };

  useEffect(() => {
    checkConsentStatus();
  }, []);

  if (state === "checking") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
          <h1 className="mb-2">Возврат из банка</h1>
          <p className="text-[var(--color-text-secondary)]">
            Проверяем статус подключения...
          </p>
          <p className="caption text-[var(--color-text-tertiary)] mt-2">
            Consent ID: {consentId}
          </p>
        </div>

        <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-6">
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
      </div>
    );
  }

  if (state === "approved") {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--color-success-light)] flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-[var(--color-success)]" />
        </div>
        <h1 className="mb-3 md:mb-4">Банк подключён</h1>
        <p className="text-[var(--color-text-secondary)]">
          Авторизация прошла успешно
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-error-light)] flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-[var(--color-error)]" />
          </div>
          <h1 className="mb-2">Ошибка подключения</h1>
        </div>

        <ErrorBanner message={errorMessage} onRetry={checkConsentStatus} />

        <div className="mt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.history.back()}
            className="w-full h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
          >
            Вернуться назад
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
