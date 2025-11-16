import React, { useEffect } from 'react';
import { BanksList } from '../components/BanksList';
import { useUser } from '../state/useUser';

export const BanksCatalogPage: React.FC = () => {
  const { userId, banks, refreshBanks, isFetchingBanks } = useUser();

  useEffect(() => {
    if (userId) {
      refreshBanks();
    }
  }, [userId, refreshBanks]);

  return (
    <div className="app-main">
      <div className="card">
        <h2>Банковские подключения</h2>
        <p>Список банков, доступных для расчёта Safe-to-Spend.</p>
      </div>

      {isFetchingBanks ? (
        <div className="card">
          <p>Загружаем информацию о банках...</p>
        </div>
      ) : (
        <BanksList banks={banks} />
      )}
    </div>
  );
};
