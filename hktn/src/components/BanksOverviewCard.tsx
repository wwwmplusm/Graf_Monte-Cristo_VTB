import React from 'react';

type BankStatusRecord = Record<
  string,
  {
    bank_name: string;
    status: string;
    message?: string;
  }
>;

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatTimestamp = (value?: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: 'numeric',
    month: 'long',
  });
};

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    tone: 'ok' | 'warning' | 'error';
  }
> = {
  ok: { label: 'OK', tone: 'ok' },
  success: { label: 'OK', tone: 'ok' },
  partial_error: { label: 'Частично', tone: 'warning' },
  error: { label: 'Ошибка', tone: 'error' },
};

const toneClass = (tone: 'ok' | 'warning' | 'error') => {
  switch (tone) {
    case 'warning':
      return 'status-pill status-pill--warning';
    case 'error':
      return 'status-pill status-pill--error';
    default:
      return 'status-pill';
  }
};

export const BanksOverviewCard: React.FC<{
  currentBalance: number;
  bankStatuses?: BankStatusRecord;
  fetchedAt?: string | null;
}> = ({ currentBalance, bankStatuses, fetchedAt }) => {
  const entries =
    Object.entries(bankStatuses ?? {}).map(([bankId, info]) => ({
      id: bankId,
      name: info.bank_name || bankId,
      status: info.status?.toLowerCase() ?? 'ok',
      message: info.message,
    })) ?? [];

  return (
    <div className="card banks-overview">
      <h2>Баланс и источники данных</h2>
      <p className="muted">
        Сумма рассчитана по банкам, которые ответили успешно. В таблице ниже видно, кто вернул данные, а кто нет.
      </p>
      <div className="banks-overview__summary">
        <div>
          <p className="muted">Текущий баланс</p>
          <p className="metric">{formatCurrency(currentBalance)}</p>
        </div>
        <div className="banks-overview__timestamp">
          <p className="muted">Последнее обновление</p>
          <p>{formatTimestamp(fetchedAt)}</p>
        </div>
      </div>

      <div className="banks-overview__list">
        {entries.length === 0 ? (
          <p className="muted">Нет подключённых банков.</p>
        ) : (
          entries.map((entry) => {
            const tone = STATUS_LABELS[entry.status]?.tone ?? 'warning';
            const label = STATUS_LABELS[entry.status]?.label ?? entry.status.toUpperCase();
            return (
              <div key={entry.id} className="banks-overview__row">
                <div>
                  <p className="banks-overview__bank">{entry.name}</p>
                  {entry.message ? <p className="banks-overview__message">{entry.message}</p> : null}
                </div>
                <span className={toneClass(tone)}>{label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BanksOverviewCard;
