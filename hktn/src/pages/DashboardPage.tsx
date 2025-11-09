import React, { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export const DashboardPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError } = useNotifications();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const payload = await getDashboard(userId);
        setData(payload);
      } catch (error) {
        console.error(error);
        notifyError('Не удалось получить аналитику');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [notifyError, userId]);

  if (loading) {
    return (
      <div className="app-main">
        <div className="card">Загрузка аналитики...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-main">
        <div className="card">Нет данных. Пройдите онбординг.</div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <div className="card">
        <h2>Safe-to-Spend</h2>
        <p>
          {data.safe_to_spend_daily ? `${data.safe_to_spend_daily} ₽ в день` : 'Нет расчёта'}
          {' | '}Вероятность цели: {data.goal_probability ?? 0}%
        </p>
      </div>
      <div className="card">
        <h3>Предстоящие платежи</h3>
        <ul className="list">
          {(data.upcoming_payments ?? []).map((payment, index) => (
            <li key={`${payment.name}-${index}`}>
              {payment.name}: {payment.amount ?? '—'} ₽ до {payment.date ?? '—'}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>Повторяющиеся события</h3>
        <ul className="list">
          {(data.recurring_events ?? []).map((event, index) => (
            <li key={`${event.name}-${index}`}>
              {event.name}: {event.amount ?? '—'} ₽ {event.is_income ? '(доход)' : '(расход)'} → {event.next_date}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>Кредиты</h3>
        <ul className="list">
          {(data.credit_rankings ?? []).map((credit) => (
            <li key={credit.name}>
              {credit.name}: {credit.balance} ₽ | Платёж {credit.min_payment} ₽ | Stress {credit.stress_score}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
