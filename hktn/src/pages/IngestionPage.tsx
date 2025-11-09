import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commitOnboarding, runIngestion } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

type BankStatus = {
  bank_name: string;
  status: string;
  message?: string;
};

export const IngestionPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [ingesting, setIngesting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [statuses, setStatuses] = useState<BankStatus[]>([]);
  const [ingestDone, setIngestDone] = useState(false);
  const [commitDone, setCommitDone] = useState(false);

  const handleIngest = async () => {
    if (!userId) return;
    try {
      setIngesting(true);
      const response = await runIngestion({ user_id: userId });
      setStatuses(response.bank_statuses ?? []);
      setIngestDone(true);
      notifySuccess('Загрузка транзакций завершена');
    } catch (error) {
      console.error(error);
      notifyError('Ошибка при загрузке транзакций');
    } finally {
      setIngesting(false);
    }
  };

  const handleCommit = async () => {
    if (!userId) return;
    try {
      setCommitting(true);
      await commitOnboarding({ user_id: userId });
      setCommitDone(true);
      notifySuccess('Онбординг завершён');
    } catch (error) {
      console.error(error);
      notifyError('Не удалось завершить онбординг');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 8. Инжест и коммит</h2>
        <p>Собираем транзакции со всех банков и фиксируем сессию.</p>
        <button className="btn" onClick={handleIngest} disabled={ingesting || ingestDone}>
          {ingestDone ? 'Готово' : 'Загрузить данные'}
        </button>
        {statuses.length ? (
          <ul className="list">
            {statuses.map((status) => (
              <li key={status.bank_name}>
                {status.bank_name}: {status.status} — {status.message}
              </li>
            ))}
          </ul>
        ) : null}
        {ingestDone ? (
          <button className="btn" onClick={handleCommit} disabled={committing || commitDone}>
            {commitDone ? 'Сохранено' : 'Commit onboarding'}
          </button>
        ) : null}
        {commitDone ? (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/dashboard')}>
            Перейти к аналитике
          </button>
        ) : null}
      </div>
    </div>
  );
};
