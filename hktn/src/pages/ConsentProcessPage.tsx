import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startConsent, pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser, BankSummary } from '../state/useUser';

type BankStatus = 'idle' | 'connecting' | 'pending_approval' | 'polling' | 'connected' | 'error';

type BankState = BankSummary & {
  status: BankStatus;
  errorMessage?: string;
  approvalUrl?: string;
  requestId?: string;
  consentId?: string;
};

const POLL_INTERVAL_MS = 3000;

export const ConsentProcessPage: React.FC = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { userId, userName } = useUser();
  const { notifyError, notifySuccess } = useNotifications();

  const [bankStates, setBankStates] = useState<BankState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const selectedBanks = state?.selectedBanks as BankSummary[] | undefined;
    if (!selectedBanks || selectedBanks.length === 0) {
      notifyError('Банки не выбраны. Возврат на предыдущий шаг.');
      navigate('/banks');
    } else {
      setBankStates(selectedBanks.map((bank) => ({ ...bank, status: 'idle' })));
    }
  }, [state, navigate, notifyError]);

  const updateBankStatus = (index: number, newStatus: Partial<BankState>) => {
    setBankStates((prev) => prev.map((bank, i) => (i === index ? { ...bank, ...newStatus } : bank)));
  };

  const handleConnect = useCallback(
    async (index: number) => {
      const bank = bankStates[index];
      if (!userId) return;

      updateBankStatus(index, { status: 'connecting', errorMessage: undefined });

      try {
        const response = await startConsent({ user_id: userId, bank_id: bank.id });
        if (response.auto_approved || response.state === 'approved') {
          notifySuccess(`Банк ${bank.name} успешно подключен!`);
          updateBankStatus(index, { status: 'connected', consentId: response.consent_id });
          setTimeout(() => setCurrentIndex((prev) => prev + 1), 2000);
        } else {
          updateBankStatus(index, {
            status: 'pending_approval',
            approvalUrl: response.approval_url,
            requestId: response.request_id,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        notifyError(`Ошибка подключения к ${bank.name}`);
        updateBankStatus(index, { status: 'error', errorMessage: message });
      }
    },
    [bankStates, userId, notifySuccess, notifyError]
  );

  const handlePoll = useCallback(
    async (index: number) => {
      const bank = bankStates[index];
      if (!userId || !bank.requestId) return;

      updateBankStatus(index, { status: 'polling' });

      const poll = async (): Promise<boolean> => {
        try {
          const payload = await pollConsent({ user_id: userId, bank_id: bank.id, request_id: bank.requestId! });
          if (payload.state === 'approved') {
            notifySuccess(`Подтверждение от ${bank.name} получено!`);
            updateBankStatus(index, { status: 'connected', consentId: payload.consent_id });
            setTimeout(() => setCurrentIndex((prev) => prev + 1), 2000);
            return true;
          }
          return false;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ошибка опроса статуса';
          notifyError(message);
          updateBankStatus(index, { status: 'error', errorMessage: message });
          return true;
        }
      };

      const intervalId = setInterval(async () => {
        const done = await poll();
        if (done) {
          clearInterval(intervalId);
        }
      }, POLL_INTERVAL_MS);

      const done = await poll();
      if (done) {
        clearInterval(intervalId);
      }
    },
    [bankStates, notifyError, notifySuccess, userId]
  );

  const isFinished = currentIndex >= bankStates.length;

  const renderBankCard = (bank: BankState, index: number) => {
    const isCurrent = index === currentIndex;

    return (
      <div className="card" key={bank.id} style={{ opacity: isCurrent || bank.status !== 'idle' ? 1 : 0.5 }}>
        <h3>
          {index + 1}. {bank.name}
        </h3>
        {bank.status === 'idle' && isCurrent && (
          <>
            <p>Нажмите, чтобы начать подключение.</p>
            <button className="btn" onClick={() => handleConnect(index)}>
              Подключить
            </button>
          </>
        )}
        {bank.status === 'connecting' && <p>Устанавливаем соединение...</p>}
        {bank.status === 'polling' && <p>Ожидаем подтверждения от банка...</p>}
        {bank.status === 'pending_approval' && (
          <>
            <p>
              🕒 Требуется ручное подтверждение. Перейдите по ссылке в новой вкладке, авторизуйтесь и дайте согласие,
              затем вернитесь сюда.
            </p>
            {bank.approvalUrl && (
              <a href={bank.approvalUrl} target="_blank" rel="noopener noreferrer">
                Перейти на сайт банка
              </a>
            )}
            <button className="btn" style={{ marginTop: '12px' }} onClick={() => handlePoll(index)}>
              Я подтвердил в банке
            </button>
          </>
        )}
        {bank.status === 'connected' && <p style={{ color: '#16a34a' }}>✅ Успешно подключено!</p>}
        {bank.status === 'error' && (
          <>
            <p style={{ color: '#dc2626' }}>❌ Ошибка: {bank.errorMessage}</p>
            <button className="btn-secondary btn" onClick={() => handleConnect(index)}>
              Повторить
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 3. Подключение банков</h2>
        <p>
          {userName
            ? `${userName}, мы последовательно пройдем процесс получения согласия для каждого выбранного банка.`
            : 'Мы последовательно пройдем процесс получения согласия для каждого выбранного банка.'}
        </p>
      </div>
      {bankStates.map(renderBankCard)}
      {isFinished && (
        <div className="card">
          <h2>Все банки обработаны!</h2>
          <button className="btn" onClick={() => navigate('/banks/preview')}>
            Перейти к выбору продуктов
          </button>
        </div>
      )}
    </div>
  );
};
