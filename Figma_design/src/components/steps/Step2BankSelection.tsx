import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { BankCard } from "../BankCard";
import { ErrorBanner } from "../ErrorBanner";
import { Skeleton } from "../ui/skeleton";

interface Bank {
  id: string;
  name: string;
  connected: boolean;
}

interface Step2BankSelectionProps {
  onNext: (selectedBanks: string[]) => void;
  onBack: () => void;
  initialSelection?: string[];
  onboardingState: any;
  setOnboardingState: (updater: (prev: any) => any) => void;
}

type LoadingState = "idle" | "loading" | "error" | "empty" | "success";

export function Step2BankSelection({ 
  onNext, 
  onBack, 
  initialSelection = [],
  onboardingState,
  setOnboardingState
}: Step2BankSelectionProps) {
  const [selectedBanks, setSelectedBanks] = useState<string[]>(initialSelection);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");

  // Simulate API call to fetch banks
  // In real app: GET /api/banks
  const fetchBanks = async () => {
    setLoadingState("loading");
    
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // Mock data - in real app this would be an API call
      const mockBanks: Bank[] = [
        { id: "bank-a", name: "Банк A", connected: false },
        { id: "bank-b", name: "Банк B", connected: false },
        { id: "bank-c", name: "Банк C", connected: false },
      ];

      // Update onboardingState with banks
      setOnboardingState((prev: any) => ({
        ...prev,
        banks: mockBanks,
      }));

      if (mockBanks.length === 0) {
        setLoadingState("empty");
      } else {
        setLoadingState("success");
      }
    } catch (error) {
      setLoadingState("error");
    }
  };

  useEffect(() => {
    // Load banks if not already loaded
    if (onboardingState.banks.length === 0) {
      fetchBanks();
    } else {
      setLoadingState("success");
    }
  }, []);

  const handleBankSelect = (bankId: string, selected: boolean) => {
    setSelectedBanks((prev) =>
      selected ? [...prev, bankId] : prev.filter((id) => id !== bankId)
    );
  };

  const handleNext = () => {
    if (selectedBanks.length > 0) {
      onNext(selectedBanks);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Ваши банки</h1>
        <p className="text-[var(--color-text-secondary)]">
          Выберите банки, с которыми будем работать
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
                <Skeleton className="w-5 h-5 rounded" />
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

      {/* Success State - Bank List */}
      {loadingState === "success" && (
        <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
          {onboardingState.banks.map((bank: Bank) => (
            <BankCard
              key={bank.id}
              id={bank.id}
              name={bank.name}
              logo="🏦"
              selected={selectedBanks.includes(bank.id)}
              onSelect={handleBankSelect}
            />
          ))}
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
          disabled={selectedBanks.length === 0 || loadingState !== "success"}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
        >
          Продолжить
        </Button>
      </div>
    </div>
  );
}
