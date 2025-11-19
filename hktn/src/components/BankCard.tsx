import { Checkbox } from "./ui/checkbox";

interface BankCardProps {
  id: string;
  name: string;
  logo: string;
  status?: "idle" | "pending" | "connected" | "error";
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  showCheckbox?: boolean;
}

export function BankCard({ 
  id, 
  name, 
  logo, 
  status, 
  selected = false, 
  onSelect,
  showCheckbox = true
}: BankCardProps) {
  return (
    <div className="flex items-center gap-4 p-4 md:p-5 bg-[var(--color-surface-panel)] border border-[var(--color-stroke-divider)] rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-200">
      {/* Bank Logo */}
      <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center flex-shrink-0">
        <span className="text-xl md:text-2xl">{logo}</span>
      </div>

      {/* Bank Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[var(--color-text-primary)]">{name}</h3>
      </div>

      {/* Checkbox */}
      {showCheckbox && (
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect?.(id, checked as boolean)}
          className="flex-shrink-0"
        />
      )}
    </div>
  );
}
