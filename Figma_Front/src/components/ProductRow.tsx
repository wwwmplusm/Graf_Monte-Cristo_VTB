import { CreditCard, PiggyBank, Receipt } from "lucide-react";
import { Checkbox } from "./ui/checkbox";

interface ProductRowProps {
  id: string;
  type: "deposit" | "loan" | "debit_card" | "credit_card";
  name: string;
  bankName: string;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onAgreementClick?: () => void;
}

const productIcons = {
  deposit: PiggyBank,
  loan: Receipt,
  debit_card: CreditCard,
  credit_card: CreditCard,
};

export function ProductRow({
  id,
  type,
  name,
  bankName,
  selected = false,
  onSelect,
  onAgreementClick,
}: ProductRowProps) {
  const Icon = productIcons[type];

  return (
    <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-[var(--color-bg-secondary)] border border-[var(--color-stroke-divider)] rounded-xl hover:bg-[var(--color-surface-panel)] transition-colors duration-200">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-[var(--color-brand-primary)] bg-opacity-10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-[var(--color-brand-primary)]" />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[var(--color-text-primary)] mb-0.5">{name}</p>
        <p className="caption text-[var(--color-text-secondary)]">{bankName}</p>
      </div>

      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onSelect?.(id, checked as boolean)}
        className="flex-shrink-0"
      />
    </div>
  );
}
