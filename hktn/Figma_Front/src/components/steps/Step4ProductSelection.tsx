import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { ProductRow } from "../ProductRow";
import { ErrorBanner } from "../ErrorBanner";
import { Skeleton } from "../ui/skeleton";

interface Product {
  id: string;
  type: "deposit" | "loan" | "debit_card" | "credit_card";
  name: string;
  consented: boolean;
  tos_url: string;
}

interface Step4ProductSelectionProps {
  onNext: (products: any[]) => void;
  onBack: () => void;
  connectedBanks: any[];
  initialProducts: any[];
}

type LoadingState = "idle" | "loading" | "error" | "success";

export function Step4ProductSelection({
  onNext,
  onBack,
  connectedBanks,
  initialProducts,
}: Step4ProductSelectionProps) {
  const [productsByBank, setProductsByBank] = useState<Record<string, Product[]>>({});
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Load products for each connected bank
  // In real app: GET /api/products?bank_id=xxx
  const loadProductsForBank = async (bankId: string) => {
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Mock data - in real app this would be an API call
      const mockProducts: Product[] = [
        {
          id: `${bankId}-deposit`,
          type: "deposit",
          name: "Вклад",
          consented: false,
          tos_url: "#terms-deposit",
        },
        {
          id: `${bankId}-loan`,
          type: "loan",
          name: "Кредит",
          consented: false,
          tos_url: "#terms-loan",
        },
        {
          id: `${bankId}-debit`,
          type: "debit_card",
          name: "Карта: дебетовая",
          consented: false,
          tos_url: "#terms-debit",
        },
        {
          id: `${bankId}-credit`,
          type: "credit_card",
          name: "Карта: кредитная",
          consented: false,
          tos_url: "#terms-credit",
        },
      ];

      setProductsByBank((prev) => ({
        ...prev,
        [bankId]: mockProducts,
      }));
    } catch (error) {
      throw new Error(`Failed to load products for ${bankId}`);
    }
  };

  const loadAllProducts = async () => {
    setLoadingState("loading");
    setErrorMessage("");

    try {
      // Load products for all connected banks
      await Promise.all(connectedBanks.map((bank: any) => loadProductsForBank(bank.id)));
      setLoadingState("success");
    } catch (error: any) {
      setErrorMessage(error.message || "Не удалось загрузить продукты");
      setLoadingState("error");
    }
  };

  useEffect(() => {
    // Load products if not already loaded
    const hasProducts = connectedBanks.every((bank: any) => productsByBank[bank.id]);
    
    if (!hasProducts && connectedBanks.length > 0) {
      loadAllProducts();
    } else if (connectedBanks.length > 0) {
      setLoadingState("success");
    }
  }, []);

  const handleProductToggle = (bankId: string, productId: string, consented: boolean) => {
    setProductsByBank((prev) => ({
      ...prev,
      [bankId]: prev[bankId].map((p) =>
        p.id === productId ? { ...p, consented } : p
      ),
    }));
  };

  const handleSelectAllForBank = (bankId: string, selected: boolean) => {
    setProductsByBank((prev) => ({
      ...prev,
      [bankId]: prev[bankId].map((p) => ({ ...p, consented: selected })),
    }));
  };

  const handleNext = () => {
    // In real app: POST /api/products/consent
    // Body: { user_id, items: [{ bank_id, product_id, consent: boolean }] }
    
    if (agreed) {
      // Convert productsByBank to array of selected products
      const selectedProducts = Object.entries(productsByBank).flatMap(([bankId, products]) =>
        products
          .filter(p => p.consented)
          .map(p => ({
            bank_id: bankId,
            product_id: p.id,
            product_type: p.type,
          }))
      );
      onNext(selectedProducts);
    }
  };

  const hasSelectedProducts = Object.values(productsByBank).some((products) =>
    products.some((p) => p.consented)
  );

  if (loadingState === "loading") {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="mb-3 md:mb-4">Выбор продуктов</h1>
          <p className="text-[var(--color-text-secondary)]">
            Загружаем доступные продукты...
          </p>
        </div>

        <div className="space-y-6">
          {connectedBanks.map((bank: any) => (
            <div
              key={bank.id}
              className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadingState === "error") {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="mb-3 md:mb-4">Выбор продуктов</h1>
        </div>

        <ErrorBanner message={errorMessage} onRetry={loadAllProducts} />

        <div className="mt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={onBack}
            className="w-full h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
          >
            Назад
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="mb-3 md:mb-4">Выбор продуктов</h1>
        <p className="text-[var(--color-text-secondary)]">
          Выберите продукты, которые можно использовать в приложении
        </p>
      </div>

      <div className="space-y-6 mb-6 md:mb-8">
        {connectedBanks.map((bank: any) => {
          const bankProducts = productsByBank[bank.id] || [];
          const allSelected = bankProducts.every((p) => p.consented);

          return (
            <div
              key={bank.id}
              className="bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl p-4 md:p-6"
            >
              {/* Bank Header with Select All */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--color-stroke-divider)]">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center">
                  <span className="text-lg">🏦</span>
                </div>
                <div className="flex-1">
                  <h2>{bank.name}</h2>
                  <a
                    href="#"
                    className="caption text-[var(--color-brand-primary)] hover:underline"
                    onClick={(e) => e.preventDefault()}
                  >
                    Прочитать соглашение →
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`select-all-${bank.id}`}
                    checked={allSelected}
                    onCheckedChange={(checked) => handleSelectAllForBank(bank.id, checked as boolean)}
                  />
                  <Label htmlFor={`select-all-${bank.id}`} className="caption text-[var(--color-text-secondary)] cursor-pointer">
                    Выбрать всё
                  </Label>
                </div>
              </div>

              {/* Products List */}
              <div className="space-y-2">
                {bankProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    id={product.id}
                    type={product.type}
                    name={product.name}
                    bankName={bank.name}
                    selected={product.consented}
                    onSelect={(id, selected) => handleProductToggle(bank.id, id, selected)}
                    onAgreementClick={() => window.open(product.tos_url, "_blank")}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agreement Checkbox */}
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-stroke-divider)] rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Checkbox id="final-agreement" checked={agreed} onCheckedChange={(checked) => setAgreed(checked as boolean)} />
          <Label htmlFor="final-agreement" className="text-[var(--color-text-primary)] cursor-pointer">
            Прочитал и согласен с использованием выбранных продуктов
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
          onClick={handleNext}
          disabled={!hasSelectedProducts || !agreed}
          className="w-full md:flex-1 h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
        >
          Продолжить
        </Button>
      </div>
    </div>
  );
}
