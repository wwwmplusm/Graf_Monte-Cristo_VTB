import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { StatusChip } from "../StatusChip";
import { ErrorBanner } from "../ErrorBanner";
import { Shield, CreditCard, PiggyBank, Receipt } from "lucide-react";

interface Bank {
  id: string;
  name: string;
  connected?: boolean;
}

interface Step3BankConsentProps {
  onNext: (consents: Record<string, string>) => void;
  onBack: () => void;
  selectedBanks: string[];
  banks: Bank[];
  initialConsents?: Record<string, string>;
}

type ConsentState = "idle" | "loading" | "success" | "error";

interface ProductType {
  id: string;
  type: "deposit" | "loan" | "debit_card" | "credit_card";
  name: string;
  icon: typeof PiggyBank;
}

const availableProducts: ProductType[] = [
  { id: "deposit", type: "deposit", name: "Вклады", icon: PiggyBank },
  { id: "debit_card", type: "debit_card", name: "Дебетовые карты", icon: CreditCard },
  { id: "credit_card", type: "credit_card", name: "Кредитные карты", icon: CreditCard },
  { id: "loan", type: "loan", name: "Кредиты", icon: Receipt },
];

export function Step3BankConsent({ 
  onNext, 
  onBack,
  selectedBanks,
  banks,
  initialConsents = {}
}: Step3BankConsentProps) {
  const [currentBankIndex, setCurrentBankIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<ConsentState>("idle");
  const [consents, setConsents] = useState<Record<string, string>>(initialConsents);

  const currentBankId = selectedBanks[currentBankIndex];
  const currentBank = banks.find(b => b.id === currentBankId);
  const totalBanks = selectedBanks.length;
  const isLastBank = currentBankIndex === totalBanks - 1;

  // Reset state when bank changes
  useEffect(() => {
    setAgreed(false);
    setState("idle");
  }, [currentBankId]);

  // Auto-advance when successfully connected
  useEffect(() => {
    if (state === "success") {
      const timer = setTimeout(() => {
        if (isLastBank) {
          // All banks connected, proceed to next step
          onNext(consents);
        } else {
          // Move to next bank
          setCurrentBankIndex(prev => prev + 1);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, isLastBank, consents, onNext]);

  const handleConnect = () => {
    setState("loading");
    
    // Simulate API call with random success/failure
    const delay = Math.random() * 400 + 800; // 800-1200ms
    setTimeout(() => {
      const success = Math.random() > 0.2; // 80% success rate
      if (success) {
        // Generate consent ID
        const consentId = `consent-${currentBankId}-${Date.now()}`;
        setConsents(prev => ({
          ...prev,
          [currentBankId]: consentId
        }));
        setState("success");
      } else {
        setState("error");
      }
    }, delay);
  };

  const handleRetry = () => {
    setState("idle");
    setAgreed(false);
  };

  if (!currentBank) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <p className="text-[var(--color-text-secondary)]">Банк не найден</p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center">
            <span className="text-3xl md:text-4xl">🏦</span>
          </div>
          <h1 className="mb-2">Подключение к {currentBank.name}</h1>
          <StatusChip status="pending" />
        </div>
        
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-full bg-[var(--color-success-light)] flex items-center justify-center">
          <span className="text-3xl md:text-4xl">✓</span>
        </div>
        <h1 className="mb-2">Успешно подключено!</h1>
        <StatusChip status="connected" />
        {!isLastBank && (
          <p className="text-[var(--color-text-secondary)] mt-4">
            Переходим к следующему банку...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Bank Header */}
      <div className="text-center mb-6 md:mb-8">
        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center">
          <span className="text-3xl md:text-4xl">🏦</span>
        </div>
        <h1 className="mb-2">Согласие с {currentBank.name}</h1>
        {totalBanks > 1 && (
          <p className="caption text-[var(--color-text-tertiary)]">
            Банк {currentBankIndex + 1} из {totalBanks}
          </p>
        )}
      </div>

      {state === "error" && (
        <div className="mb-6">
          <ErrorBanner
            message="Не удалось подключить банк. Повторите попытку"
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* Available Products */}
      <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6 mb-6">
        <h2 className="mb-4">Доступные продукты</h2>
        <div className="space-y-2">
          {availableProducts.map((product) => {
            const Icon = product.icon;
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[var(--color-brand-primary)]" />
                </div>
                <span className="text-[var(--color-text-primary)]">{product.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consent Content */}
      <div className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Shield className="w-5 h-5 text-[var(--color-brand-primary)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[var(--color-text-primary)] mb-2">
              Разрешите нам только чтение счетов, карт, кредитов и транзакций для построения вашего плана.
            </p>
            <a
              href="#"
              className="caption text-[var(--color-brand-primary)] hover:underline"
              onClick={(e) => e.preventDefault()}
            >
              Прочитать пользовательское соглашение →
            </a>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-xl">
          <Checkbox
            id={`consent-${currentBankId}`}
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked as boolean)}
          />
          <Label
            htmlFor={`consent-${currentBankId}`}
            className="text-[var(--color-text-primary)] cursor-pointer"
          >
            Прочитал и согласен с условиями
          </Label>
        </div>
      </div>

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
          onClick={handleConnect}
          disabled={!agreed}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
        >
          Выдать доступ
        </Button>
      </div>
    </div>
  );
}
