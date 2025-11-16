import React from 'react';

type BankStatus = {
  bank_name: string;
  status: string;
  fetched_at: string | null;
};

type BanksOverviewCardProps = {
  totalBalance: number;
  bankStatuses: Record<string, BankStatus>;
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'long',
  });
};

const STATUS_LABELS: Record<string, { label: string; tone: 'ok' | 'error' }> = {
  ok: { label: 'OK', tone: 'ok' },
  error: { label: 'Ошибка', tone: 'error' },
};

const toneClass = (tone: 'ok' | 'error') => (tone === 'error' ? 'status-pill status-pill--error' : 'status-pill');

export const BanksOverviewCard: React.FC<BanksOverviewCardProps> = ({ totalBalance, bankStatuses }) => {
  const entries = Object.entries(bankStatuses ?? {}).map(([bankId, info]) => ({
    id: bankId,
    ...info,
  }));

  return (
    <div className="card banks-overview">
      <h2>Баланс и источники данных</h2>
      <p className="muted">Сумма на всех счетах в банках, которые успешно ответили на наш запрос.</p>
      <div className="banks-overview__summary">
        <div>
          <p className="muted">Текущий баланс</p>
          <p className="metric">{formatCurrency(totalBalance)}</p>
        </div>
      </div>

      <div className="banks-overview__list">
        {entries.length === 0 ? (
          <p className="muted">Нет подключённых банков.</p>
        ) : (
          entries.map((entry) => {
            const statusInfo = STATUS_LABELS[entry.status] ?? { label: 'НЕИЗВЕСТНО', tone: 'error' };
            return (
              <div key={entry.id} className="banks-overview__row">
                <div>
                  <p className="banks-overview__bank">{entry.bank_name}</p>
                  <p className="banks-overview__message">Обновлено: {formatTimestamp(entry.fetched_at)}</p>
                </div>
                <span className={toneClass(statusInfo.tone)}>{statusInfo.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BanksOverviewCard;
