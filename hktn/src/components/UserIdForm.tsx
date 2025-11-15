import React, { useState } from 'react';

// ИЗМЕНЕНО: Новое регулярное выражение для формата team260-X (где X от 1 до 10)
export const USER_ID_PATTERN = /^team260-([1-9]|10)$/i;

export const validateUserId = (value: string): boolean => USER_ID_PATTERN.test(value.trim());

type UserIdFormProps = {
  defaultValue?: string | null;
  onSubmit: (userId: string) => void | Promise<void>;
  isSubmitting?: boolean;
};

export const UserIdForm: React.FC<UserIdFormProps> = ({ defaultValue = '', onSubmit, isSubmitting }) => {
  const [value, setValue] = useState(defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!validateUserId(trimmed)) {
      // ИЗМЕНЕНО: Новый текст ошибки
      setError('ID должен быть в формате team260-X, где X от 1 до 10');
      return;
    }
    setError(null);
    await onSubmit(trimmed);
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Введите ID команды</h2>
      <p>Используйте формат team260-1. ID хранится локально и нужен для связи шагов.</p>
      <label htmlFor="user-id-input">User ID</label>
      <input
        id="user-id-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="team260-1"
        className="text-input"
        disabled={isSubmitting}
      />
      {error ? (
        <p role="alert" style={{ color: '#dc2626', marginTop: 8 }}>
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={isSubmitting}>
        Продолжить
      </button>
    </form>
  );
};
