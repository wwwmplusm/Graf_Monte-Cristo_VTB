import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="p-4 md:p-5 bg-[var(--color-error-light)] border border-[var(--color-error)] rounded-xl flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-[var(--color-error)] mb-3">{message}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-white"
          >
            Повторить попытку
          </Button>
        )}
      </div>
    </div>
  );
}
