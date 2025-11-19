import { CheckCircle, Clock, AlertCircle, Circle } from "lucide-react";

type ChipStatus = "idle" | "pending" | "connected" | "error";

interface StatusChipProps {
  status: ChipStatus;
  label?: string;
}

const statusConfig = {
  idle: {
    icon: Circle,
    label: "Не подключено",
    className: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
  },
  pending: {
    icon: Clock,
    label: "Подключение...",
    className: "bg-[var(--color-pending-light)] text-[var(--color-pending)]",
  },
  connected: {
    icon: CheckCircle,
    label: "Подключено",
    className: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  },
  error: {
    icon: AlertCircle,
    label: "Ошибка",
    className: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  },
};

export function StatusChip({ status, label }: StatusChipProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const displayLabel = label || config.label;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full caption
        ${config.className}
      `}
    >
      <Icon className="w-3 h-3" />
      <span>{displayLabel}</span>
    </div>
  );
}
