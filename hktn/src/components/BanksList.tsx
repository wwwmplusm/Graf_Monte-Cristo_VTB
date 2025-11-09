import React from 'react';
import type { BankSummary } from '../state/useUser';

type BanksListProps = {
  banks: BankSummary[];
  onConnect: (bank: BankSummary) => void;
  busyBankId?: string | null;
};

export const BanksList: React.FC<BanksListProps> = ({ banks, onConnect, busyBankId }) => {
  if (!banks.length) {
    return (
      <div className="card">
        <p>Каталог банков пуст. Проверьте настройки бэкенда.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-two">
      {banks.map((bank) => (
        <div key={bank.id} className="card">
          <h3>{bank.name}</h3>
          <p style={{ marginTop: 4, color: '#475569' }}>Base URL: {bank.baseUrl || 'не указан'}</p>
          {bank.error ? (
            <p style={{ color: '#dc2626' }}>{bank.error}</p>
          ) : (
            <p style={{ color: bank.connected ? '#16a34a' : '#475569' }}>
              {bank.connected ? 'Уже подключён' : 'Ожидает подключения'}
            </p>
          )}
          <button
            type="button"
            className="btn"
            disabled={!!bank.error || bank.connected || busyBankId === bank.id}
            onClick={() => onConnect(bank)}
          >
            {bank.connected ? 'Готово' : busyBankId === bank.id ? 'Создание...' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
};
