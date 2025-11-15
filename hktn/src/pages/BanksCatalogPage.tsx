import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

export const BanksCatalogPage: React.FC = () => {
  const { banks, refreshBanks, isFetchingBanks } = useUser();
  const { notifyError } = useNotifications();
  const navigate = useNavigate();
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    refreshBanks();
  }, [refreshBanks]);

  const handleToggleBank = (bankId: string) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(bankId)) {
        next.delete(bankId);
      } else {
        next.add(bankId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (selectedBankIds.size === 0) {
      notifyError('Выберите хотя бы один банк');
      return;
    }
    const selectedBanks = banks.filter((bank) => selectedBankIds.has(bank.id));
    navigate('/onboarding/consent', { state: { selectedBanks } });
  };

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 2. Выберите банки</h2>
        <p>Отметьте банки, которые хотите подключить для анализа.</p>
      </div>

      {isFetchingBanks && (
        <div className="card">
          <p>Загрузка списка банков...</p>
        </div>
      )}

      {!isFetchingBanks && banks.length === 0 && (
        <div className="card">
          <p>Каталог банков пуст. Проверьте настройки бэкенда.</p>
        </div>
      )}

      <div className="card">
        {banks.map((bank) => (
          <div key={bank.id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedBankIds.has(bank.id)}
                onChange={() => handleToggleBank(bank.id)}
                disabled={bank.connected}
              />
              <div>
                <strong>{bank.name}</strong>
                <p style={{ margin: 0, fontSize: 14, color: bank.connected ? '#16a34a' : '#475569' }}>
                  {bank.connected ? 'Уже подключён' : 'Готов к подключению'}
                </p>
              </div>
            </label>
          </div>
        ))}
      </div>

      <button className="btn" onClick={handleSubmit} disabled={selectedBankIds.size === 0}>
        Продолжить
      </button>
    </div>
  );
};
