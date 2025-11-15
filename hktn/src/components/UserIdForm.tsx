import React, { useState } from 'react';

export const USER_ID_PATTERN = /^team260-([1-9]|10)$/i;
export const validateUserId = (value: string): boolean => USER_ID_PATTERN.test(value.trim());

type UserIdFormProps = {
  defaultUserId?: string | null;
  defaultUserName?: string | null;
  onSubmit: (userId: string, userName: string) => void | Promise<void>;
  isSubmitting?: boolean;
};

export const UserIdForm: React.FC<UserIdFormProps> = ({
  defaultUserId = '',
  defaultUserName = '',
  onSubmit,
  isSubmitting,
}) => {
  const [userId, setUserId] = useState(defaultUserId ?? '');
  const [userName, setUserName] = useState(defaultUserName ?? '');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedId = userId.trim();
    const trimmedName = userName.trim();

    if (!validateUserId(trimmedId)) {
      setError('ID должен быть в формате team260-X, где X от 1 до 10');
      return;
    }
    if (!trimmedName) {
      setError('Пожалуйста, введите ваше имя');
      return;
    }
    if (!agreed) {
      setError('Необходимо согласиться на обработку персональных данных');
      return;
    }
    setError(null);
    await onSubmit(trimmedId, trimmedName);
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Шаг 1. Идентификация</h2>
      <p>Введите ваш ID и имя для начала работы.</p>

      <label htmlFor="user-id-input">User ID</label>
      <input
        id="user-id-input"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="team260-1"
        className="text-input"
        disabled={isSubmitting}
      />

      <label htmlFor="user-name-input">Ваше имя</label>
      <input
        id="user-name-input"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Иван Иванов"
        className="text-input"
        disabled={isSubmitting}
      />

      <label style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>Я согласен на обработку персональных данных</span>
      </label>

      {error ? (
        <p role="alert" style={{ color: '#dc2626', marginTop: 8 }}>
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={isSubmitting || !agreed}>
        Продолжить
      </button>
    </form>
  );
};
