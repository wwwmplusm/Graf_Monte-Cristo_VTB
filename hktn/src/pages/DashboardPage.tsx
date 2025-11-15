import React, { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useUser } from '../state/useUser';
import { useNotifications } from '../state/notifications';
import type {
  BudgetBreakdownItem,
  DashboardResponse,
  RecurringEvent,
  UpcomingEvent,
} from '../types/dashboard';

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
  const hasValue = typeof data.safe_to_spend_daily === 'number' && !Number.isNaN(data.safe_to_spend_daily ?? NaN);
  const cycleEndLabel = narrative?.cycle_end ? formatDate(narrative.cycle_end) : null;
  const balanceValue = narrative?.current_balance ?? data.current_balance;
  const obligationsValue = narrative?.obligations_total ?? 0;
  const spendableValue = narrative?.spendable_total ?? null;
  const isBalanceLow =
    hasValue && typeof balanceValue === 'number' && typeof data.safe_to_spend_daily === 'number'
      ? balanceValue < data.safe_to_spend_daily
      : false;

  return (
    <div className="card">
      <h2>Safe-to-Spend</h2>
      <p className="muted">Рекомендованный дневной лимит до следующей зарплаты.</p>
      {context?.message ? (
        <div className={`callout callout--${context.state === 'missing_balance' ? 'warning' : 'info'}`}>
          {context.message}
        </div>
      ) : null}
      <p className="metric">
        {hasValue ? formatCurrency(data.safe_to_spend_daily ?? undefined) : 'Нет оценки'}
        <span> / день</span>
      </p>
      {cycleEndLabel ? (
        <p className="muted">
          Бюджет действует до <strong>{cycleEndLabel}</strong>.
        </p>
      ) : null}
      {isBalanceLow && (
        <div className="callout callout--warning">
          Баланс ({formatCurrency(balanceValue)}) ниже дневного лимита. Сократите траты сегодня.
        </div>
      )}
      <div className="safe-obligations">
        <div>Баланс: {formatCurrency(balanceValue)}</div>
        <div>Обязательства в горизонте: {formatCurrency(obligationsValue)}</div>
        <div>Резерв на цель: {formatCurrency(narrative?.goal_reserve)}</div>
        <div>Доступно на цикл: {formatCurrency(spendableValue)}</div>
      </div>
    </div>
  );
};

const UpcomingEventsCard: React.FC<{
  events?: UpcomingEvent[];
  narrative?: DashboardResponse['safe_to_spend_narrative'];
}> = ({ events, narrative }) => {
  const cycleEndLabel = narrative?.cycle_end ? formatDate(narrative.cycle_end) : '—';
  const items = events ?? [];
  const nextIncome = narrative?.next_income_event;

  return (
    <div className="card">
      <h3>До зарплаты ({cycleEndLabel})</h3>
      <ul className="list">
        <li className="event-row">
          <div className="event-row__header">
            <div>
              <p className="event-row__title">Текущий баланс</p>
              <p className="event-row__subtitle">{formatDate(narrative?.cycle_start)}</p>
            </div>
            <div className="event-row__amount">
              <span>{formatCurrency(narrative?.current_balance)}</span>
            </div>
          </div>
        </li>
        {items.length > 0 ? (
          items.map((event, index) => (
            <li
              key={`${event.name}-${index}`}
              className={`event-row ${event.is_income ? 'event-row--income' : 'event-row--expense'}`}
            >
              <div className="event-row__header">
                <div>
                  <p className="event-row__title">{event.name}</p>
                  <p className="event-row__subtitle">{formatDate(event.date)}</p>
                </div>
                <div className="event-row__amount">
                  <span>{formatCurrency(event.amount)}</span>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="muted">Нет фиксированных платежей в этом горизонте.</li>
        )}
        {nextIncome ? (
          <li className="event-row event-row--income">
            <div className="event-row__header">
              <div>
                <p className="event-row__title">{nextIncome.label ?? 'Доход'}</p>
                <p className="event-row__subtitle">{formatDate(nextIncome.next_occurrence)}</p>
              </div>
              <div className="event-row__amount">
                <span>{formatCurrency(nextIncome.amount)}</span>
              </div>
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
};

const BudgetCard: React.FC<{
  budget?: BudgetBreakdownItem[];
  narrative?: DashboardResponse['safe_to_spend_narrative'];
}> = ({ budget, narrative }) => (
  <div className="card">
    <h3>Ваш бюджет на жизнь ({narrative?.days_in_cycle ?? 0} д.)</h3>
    <p className="muted">Предлагаем так распределить свободные средства до следующей выплаты.</p>
    <ul className="list">
      <li className="event-row event-row--expense">
        <div className="event-row__header">
          <div>
            <p className="event-row__title">Всего доступно</p>
          </div>
          <div className="event-row__amount">
            <strong>{formatCurrency(narrative?.spendable_total)}</strong>
          </div>
        </div>
      </li>
      {budget && budget.length > 0 ? (
        budget.map((item, index) => (
          <li key={`${item.category}-${index}`} className="event-row event-row--expense">
            <div className="event-row__header">
              <div>
                <p className="event-row__title">{item.category}</p>
              </div>
              <div className="event-row__amount">
                <span>{formatCurrency(item.amount)}</span>
              </div>
            </div>
          </li>
        ))
      ) : (
        <li className="muted">Нет переменных трат для распределения.</li>
      )}
      <li className="event-row event-row--income">
        <div className="event-row__header">
          <div>
            <p className="event-row__title">Резерв на цель</p>
          </div>
          <div className="event-row__amount">
            <span>{formatCurrency(narrative?.goal_reserve)}</span>
          </div>
        </div>
      </li>
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
        <UpcomingEventsCard events={data.upcoming_events} narrative={data.safe_to_spend_narrative} />
        <BudgetCard budget={data.budget_breakdown} narrative={data.safe_to_spend_narrative} />
      </div>
      <RecurringEventsCard events={data.recurring_events} />
    </div>
  );
};

export default DashboardPage;
