import React, { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useUser } from '../state/useUser';
import { useNotifications } from '../state/notifications';
import type { DashboardResponse, RecurringEvent, UpcomingPayment } from '../types/dashboard';

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

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
};

const STSCard: React.FC<{ data: DashboardResponse }> = ({ data }) => {
  const context = data.safe_to_spend_context;
  const narrative = data.safe_to_spend_narrative;
  const hasValue = typeof data.safe_to_spend_daily === 'number' && !Number.isNaN(data.safe_to_spend_daily);
  const calloutTone = context?.state === 'missing_balance' ? 'warning' : 'info';

  return (
    <div className="card">
      <h2>Safe-to-Spend</h2>
      <p className="muted">Ответ на вопрос «сколько можно потратить сегодня и остаться в курсе плана».</p>
      {context?.message && (
        <div className={`callout callout--${calloutTone}`}>
          {context.message}
        </div>
      )}
      <p className="metric">
        {hasValue ? formatCurrency(data.safe_to_spend_daily ?? undefined) : '—'}
        <span> / день</span>
      </p>
      <p className="muted">
        Вероятность достижения цели: <strong>{data.goal_probability ?? 0}%</strong>
      </p>
      <div className="safe-obligations">
        <div>Текущий баланс: {formatCurrency(data.current_balance)}</div>
        {narrative ? (
          <>
            <div>Обязательства до {formatDate(narrative.cycle_end)}: {formatCurrency(narrative.obligations_total)}</div>
            <div>Резерв на цель: {formatCurrency(narrative.goal_reserve)}</div>
            <div>Доступно в цикле ({narrative.days_in_cycle ?? 0} д.): {formatCurrency(narrative.spendable_total)}</div>
          </>
        ) : (
          <div>Нужны данные по регулярным платежам.</div>
        )}
      </div>
    </div>
  );
};

const FinancialSnapshotCard: React.FC<{ data: DashboardResponse }> = ({ data }) => (
  <div className="card">
    <h3>Финансовый GPS</h3>
    <div className="snapshot-grid">
      <div className="snapshot-item">
        <p className="muted">Где я сейчас?</p>
        <strong>{formatCurrency(data.current_balance)}</strong>
      </div>
      <div className="snapshot-item">
        <p className="muted">Сколько долга осталось?</p>
        <strong>{formatCurrency(data.total_debt ?? 0)}</strong>
      </div>
      <div className="snapshot-item">
        <p className="muted">Финансовое здоровье</p>
        <strong>{data.health_score ?? 0}/100</strong>
      </div>
      <div className="snapshot-item">
        <p className="muted">Подключено счетов</p>
        <strong>{data.balance_context?.account_count ?? 0}</strong>
      </div>
    </div>
  </div>
);

const UpcomingPaymentsCard: React.FC<{ payments?: UpcomingPayment[] }> = ({ payments }) => (
  <div className="card">
    <h3>Предстоящие обязательства</h3>
    <ul className="list">
      {payments && payments.length > 0 ? (
        payments.map((payment, index) => (
          <li key={`${payment.name}-${index}`} className="event-row">
            <div className="event-row__header">
              <div>
                <p className="event-row__title">{payment.name}</p>
                <p className="event-row__subtitle">Срок: {formatDate(payment.due_date)}</p>
              </div>
              <div className="event-row__amount">
                <span>{formatCurrency(payment.amount)}</span>
              </div>
            </div>
          </li>
        ))
      ) : (
        <li className="muted">Нет обязательств в горизонте 30 дней.</li>
      )}
    </ul>
  </div>
);

const RecurringEventsCard: React.FC<{ events?: RecurringEvent[] }> = ({ events }) => (
  <div className="card">
    <h3>Финансовые привычки</h3>
    <ul className="list">
      {events && events.length > 0 ? (
        events.map((event, index) => (
          <li key={`${event.name}-${index}`} className={`event-row ${event.is_income ? 'event-row--income' : 'event-row--expense'}`}>
            <div className="event-row__header">
              <div>
                <p className="event-row__title">{event.name}</p>
                <p className="event-row__subtitle">Следующее: {formatDate(event.next_date)}</p>
              </div>
              <div className="event-row__amount">
                <span>{formatCurrency(event.amount)}</span>
              </div>
            </div>
          </li>
        ))
      ) : (
        <li className="muted">Пока не нашли повторяющихся событий.</li>
      )}
    </ul>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError } = useNotifications();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        setLoading(true);
        const payload = await getDashboard(userId);
        setData(payload);
      } catch (error) {
        console.error(error);
        notifyError('Не удалось загрузить данные для дашборда.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [notifyError, userId]);

  if (loading) {
    return (
      <div className="app-main">
        <div className="card">
          <p>Анализируем ваши финансы и строим прогнозы...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-main">
        <div className="card">
          <h2>Нет данных</h2>
          <p>Не удалось загрузить аналитику. Пройдите онбординг ещё раз.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <STSCard data={data} />
      <div className="grid grid-two">
        <FinancialSnapshotCard data={data} />
        <UpcomingPaymentsCard payments={data.upcoming_payments} />
      </div>
      <RecurringEventsCard events={data.recurring_events} />
    </div>
  );
};

export default DashboardPage;
