import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BanksList } from '../components/BanksList';
import { startConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

export const BanksCatalogPage: React.FC = () => {
  const { userId, banks, refreshBanks, upsertConsent } = useUser();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [busyBankId, setBusyBankId] = useState<string | null>(null);

  useEffect(() => {
    refreshBanks();
  }, [refreshBanks]);

  const handleConnect = async (bank: { id: string; name: string }) => {
    if (!userId) return;
    try {
      setBusyBankId(bank.id);
      const response = await startConsent({ user_id: userId, bank_id: bank.id });
      upsertConsent({
        bankId: bank.id,
        requestId: response.request_id,
        consentId: response.consent_id,
        status: response.state,
        approvalUrl: response.approval_url,
      });
      notifySuccess(`Запрос в ${bank.name} создан`);
      if (response.state === 'approved') {
        navigate('/banks/preview');
      } else {
        const search = new URLSearchParams({ requestId: response.request_id ?? '', bankName: bank.name });
        navigate(`/banks/${bank.id}/status?${search.toString()}`);
      }
    } catch (error) {
      console.error(error);
      notifyError('Не удалось инициировать консент');
    } finally {
      setBusyBankId(null);
      refreshBanks();
    }
  };

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 2. Выберите банк</h2>
        <p>Подключите хотя бы один банк, чтобы перейти к предпросмотру продуктов.</p>
      </div>
      <BanksList banks={banks} onConnect={handleConnect} busyBankId={busyBankId} />
    </div>
  );
};
