import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { loginUser } from "../../utils/api";

interface Step1UserInfoProps {
  onNext: (userId: string, userName: string) => void;
  onSkip: () => void;
  initialUserId?: string;
  initialName?: string;
}

export function Step1UserInfo({
  onNext,
  onSkip,
  initialUserId = "",
  initialName = ""
}: Step1UserInfoProps) {
  const [userId, setUserId] = useState(initialUserId);
  const [name, setName] = useState(initialName);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim() && name.trim() && agreedToTerms) {
      setIsLoading(true);
      setError(null);

      try {
        const response = await loginUser({
          user_id: userId.trim(),
          user_name: name.trim(),
        });

        console.log('Login successful:', response);
        onNext(userId.trim(), name.trim());
      } catch (err) {
        console.error('Login failed:', err);
        setError(err instanceof Error ? err.message : 'Ошибка входа');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8 md:mb-10">
        <h1 className="mb-3 md:mb-4">Добро пожаловать</h1>
        <p className="text-[var(--color-text-secondary)]">
          Расскажите о себе, чтобы мы персонализировали план
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
        {/* User ID field */}
        <div>
          <Label htmlFor="user-id" className="text-[var(--color-text-primary)] mb-2 block">
            User ID
          </Label>
          <Input
            id="user-id"
            type="text"
            placeholder="demo-001"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-12 md:h-14 rounded-xl border-[var(--color-stroke-input)] bg-[var(--color-surface-panel)]"
          />
          <p className="caption text-[var(--color-text-tertiary)] mt-2">
            Используется для API-запросов
          </p>
        </div>

        {/* User Name field */}
        <div>
          <Label htmlFor="name" className="text-[var(--color-text-primary)] mb-2 block">
            Ваше имя
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="Иван"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 md:h-14 rounded-xl border-[var(--color-stroke-input)] bg-[var(--color-surface-panel)]"
          />
        </div>

        <div className="flex items-start gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-xl">
          <Checkbox
            id="terms-agreement"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
          />
          <Label
            htmlFor="terms-agreement"
            className="text-[var(--color-text-primary)] cursor-pointer"
          >
            Прочитал и согласен с{" "}
            <a
              href="#"
              className="text-[var(--color-brand-primary)] hover:underline"
              onClick={(e) => e.preventDefault()}
            >
              пользовательским соглашением
            </a>
          </Label>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 md:h-14 rounded-xl bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-white"
            disabled={!userId.trim() || !name.trim() || !agreedToTerms || isLoading}
          >
            {isLoading ? 'Вход...' : 'Продолжить'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onSkip}
            className="w-full h-12 md:h-14 rounded-xl border-[var(--color-stroke-divider)] text-[var(--color-text-primary)]"
          >
            Пропустить
          </Button>
        </div>
      </form>
    </div>
  );
}
