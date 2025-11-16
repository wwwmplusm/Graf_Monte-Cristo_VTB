import React, { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useUser } from '../state/useUser';
import { useNotifications } from '../state/notifications';
import type { DashboardResponse } from '../types/dashboard';
import { BanksOverviewCard } from '../components/BanksOverviewCard';

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
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
  return parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

const STSCard: React.FC<{ data: DashboardResponse }> = ({ data }) => {
  const nextSalaryLabel = formatDate(data.next_salary_date);
  const creditPaymentLabel = formatDate(data.upcoming_credit_payment?.next_payment_date);

  return (
    <div className="card">
      <h2>Safe-to-Spend</h2>
      <p className="muted">Рекомендованный дневной лимит до следующей зарплаты ({nextSalaryLabel}).</p>
      <p className="metric">
        {formatCurrency(data.safe_to_spend_daily)}
        <span> / день</span>
      </p>
      <div className="safe-obligations">
        <div>
          Зарплата: <strong>{formatCurrency(data.salary_amount)}</strong>
        </div>
        <div>
          Дней до выплаты: <strong>{data.days_until_next_salary}</strong>
        </div>
        <div>
          Ближайший платёж по кредиту: {formatCurrency(data.upcoming_credit_payment?.amount)} ({creditPaymentLabel})
        </div>
      </div>
    </div>
  );
};

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
          <p>Не удалось загрузить аналитику. Возможно, нужно пройти онбординг заново.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <STSCard data={data} />
      <BanksOverviewCard totalBalance={data.total_balance} bankStatuses={data.bank_statuses} />
    </div>
  );
};

export default DashboardPage;
