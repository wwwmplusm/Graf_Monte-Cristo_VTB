import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startConsent, startProductConsent, pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser, BankSummary } from '../state/useUser';

type ConsentStep = 'accounts' | 'products';
type StepStatus = 'idle' | 'connecting' | 'pending_approval' | 'polling' | 'connected' | 'error';

type BankState = BankSummary & {
  accountsStatus: StepStatus;
  productsStatus: StepStatus;
  errorMessage?: string;
  activeStepData?: {
    approvalUrl?: string;
    requestId?: string;
  };
};

const POLL_INTERVAL_MS = 3000;

export const ConsentProcessPage: React.FC = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { userId } = useUser();
  const { notifyError, notifySuccess } = useNotifications();

  const [bankStates, setBankStates] = useState<BankState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const selectedBanks = state?.selectedBanks as BankSummary[] | undefined;
    if (!selectedBanks || selectedBanks.length === 0) {
      navigate('/banks');
    } else {
      setBankStates(
        selectedBanks.map((bank) => ({
          ...bank,
          accountsStatus: 'idle',
          productsStatus: 'idle',
          activeStepData: {},
        }))
      );
    }
  }, [state, navigate]);

  const updateBankStatus = (index: number, newState: Partial<BankState>) => {
    setBankStates((prev) => prev.map((bank, i) => (i === index ? { ...bank, ...newState } : bank)));
  };

  const finishBank = useCallback(() => {
    setTimeout(() => setCurrentIndex((prev) => prev + 1), 1200);
  }, []);

  const requestConsent = useCallback(
    async (index: number, step: ConsentStep) => {
      const bank = bankStates[index];
      if (!bank || !userId) {
        return;
      }

      const statusField = step === 'accounts' ? 'accountsStatus' : 'productsStatus';
      updateBankStatus(index, { [statusField]: 'connecting', errorMessage: undefined, activeStepData: {} });

      try {
        const apiCall = step === 'accounts' ? startConsent : startProductConsent;
        const response = await apiCall({ user_id: userId, bank_id: bank.id });
        if (response.auto_approved || response.state === 'approved') {
          notifySuccess(
            `Доступ к ${step === 'accounts' ? 'счетам/транзакциям' : 'продуктам'} для ${bank.name} получен!`
          );
          updateBankStatus(index, { [statusField]: 'connected', activeStepData: {} });
          if (step === 'accounts') {
            void requestConsent(index, 'products');
          } else {
            finishBank();
          }
        } else {
          updateBankStatus(index, {
            [statusField]: 'pending_approval',
            activeStepData: { approvalUrl: response.approval_url, requestId: response.request_id },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        notifyError(`Ошибка доступа к ${step === 'accounts' ? 'счетам' : 'продуктам'} для ${bank.name}`);
        updateBankStatus(index, { [statusField]: 'error', errorMessage: message });
      }
    },
    [bankStates, finishBank, notifyError, notifySuccess, userId]
  );

  const handlePoll = useCallback(
    async (index: number, step: ConsentStep) => {
      const bank = bankStates[index];
      const requestId = bank?.activeStepData?.requestId;
      if (!bank || !userId || !requestId) return;

      const statusField = step === 'accounts' ? 'accountsStatus' : 'productsStatus';
      updateBankStatus(index, { [statusField]: 'polling' });

      const poll = async (): Promise<boolean> => {
        try {
          const payload = await pollConsent({ user_id: userId, bank_id: bank.id, request_id: requestId });
          if (payload.state === 'approved') {
            notifySuccess(`Подтверждение на ${step === 'accounts' ? 'счета' : 'продукты'} от ${bank.name} получено!`);
            updateBankStatus(index, { [statusField]: 'connected', activeStepData: {} });
            if (step === 'accounts') {
              void requestConsent(index, 'products');
            } else {
              finishBank();
            }
            return true;
          }
          return false;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ошибка опроса статуса';
          notifyError(message);
          updateBankStatus(index, { [statusField]: 'error', errorMessage: message });
          return true;
        }
      };

      const intervalId = setInterval(async () => {
        if (await poll()) {
          clearInterval(intervalId);
        }
      }, POLL_INTERVAL_MS);

      if (await poll()) {
        clearInterval(intervalId);
      }
    },
    [bankStates, finishBank, notifyError, notifySuccess, requestConsent, userId]
  );

  useEffect(() => {
    if (bankStates.length === 0) {
      return;
    }
    if (currentIndex < bankStates.length) {
      const bank = bankStates[currentIndex];
      if (bank.accountsStatus === 'idle') {
        void requestConsent(currentIndex, 'accounts');
      }
    }
  }, [bankStates, currentIndex, requestConsent]);

  const retryBank = (index: number) => {
    const bank = bankStates[index];
    if (!bank) return;
    if (bank.accountsStatus !== 'connected') {
      void requestConsent(index, 'accounts');
    } else {
      void requestConsent(index, 'products');
    }
  };

  const isFinished = bankStates.length > 0 && currentIndex >= bankStates.length;

  const renderStepStatus = (
    label: string,
    status: StepStatus,
    bank: BankState,
    step: ConsentStep,
    index: number
  ) => (
    <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{label}</span>
      {status === 'idle' && <span style={{ color: '#94a3b8' }}>Ожидание…</span>}
      {(status === 'connecting' || status === 'polling') && <span>В процессе ⏳</span>}
      {status === 'connected' && <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ Получен</span>}
      {status === 'error' && <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ Ошибка</span>}
      {status === 'pending_approval' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {bank.activeStepData?.approvalUrl ? (
            <a className="btn-secondary btn" href={bank.activeStepData.approvalUrl} target="_blank" rel="noreferrer">
              Подтвердить в банке
            </a>
          ) : null}
          <button className="btn" onClick={() => handlePoll(index, step)}>
            Я подтвердил
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 3. Подключение банков</h2>
        <p>Для каждого банка получаем доступ к счетам и отдельное согласие на управление продуктами.</p>
      </div>
      {bankStates.map((bank, index) => (
        <div className="card" key={bank.id} style={{ opacity: index === currentIndex ? 1 : 0.6 }}>
          <h3>
            {index + 1}. {bank.name}
          </h3>
          {renderStepStatus('1. Доступ к счетам и транзакциям', bank.accountsStatus, bank, 'accounts', index)}
          {bank.accountsStatus === 'connected' &&
            renderStepStatus('2. Доступ к продуктам (кредиты/вклады/карты)', bank.productsStatus, bank, 'products', index)}
          {(bank.accountsStatus === 'error' || bank.productsStatus === 'error') && (
            <button className="btn-secondary btn" style={{ marginTop: 12 }} onClick={() => retryBank(index)}>
              Повторить
            </button>
          )}
        </div>
      ))}
      {isFinished && (
        <div className="card">
          <h2>Все банки обработаны!</h2>
          <p>Доступы получены, можно переходить к аналитике.</p>
          <button className="btn" onClick={() => navigate('/dashboard')}>
            Перейти к аналитике
          </button>
        </div>
      )}
    </div>
  );
};
