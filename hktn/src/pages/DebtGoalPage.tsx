import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCredits, saveGoal } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

type Credit = {
  name?: string;
  balance?: number;
  min_payment?: number;
  stress_score?: number;
  bank_id?: string;
  id?: string;
};

const paceOptions = [
  { value: 'conservative', label: 'Мягкий' },
  { value: 'optimal', label: 'Оптимальный' },
  { value: 'fast', label: 'Агрессивный' },
];

export const DebtGoalPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pace, setPace] = useState('optimal');
  const [timeline, setTimeline] = useState('12');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const response = await getCredits(userId);
        setCredits(response.credits ?? []);
      } catch (error) {
        console.error(error);
        notifyError('Не удалось получить список кредитов');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [notifyError, userId]);

  const toggle = (creditId: string) => {
    setSelected((prev) => ({ ...prev, [creditId]: !prev[creditId] }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    const chosen = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([creditId]) => creditId);
    try {
      setSaving(true);
      await saveGoal({
        user_id: userId,
        goal_type: 'pay_debts',
        goal_details: {
          close_speed: pace,
          close_loan_ids: chosen,
          timeline_months: Number(timeline),
        },
      });
      notifySuccess('Цель сохранена');
      navigate('/ingest');
    } catch (error) {
      console.error(error);
      notifyError('Не удалось сохранить цель');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-main">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Какие кредиты закрываем?</h2>
        {loading ? <p>Загрузка кредитов...</p> : null}
        <ul className="list">
          {credits.map((credit, index) => {
            const creditId = credit.id ?? `${credit.bank_id}-${index}`;
            return (
              <li key={creditId}>
                <label style={{ display: 'flex', gap: 12 }}>
                  <input type="checkbox" checked={selected[creditId] ?? false} onChange={() => toggle(creditId)} />
                  <div>
                    <strong>{credit.name ?? `Кредит ${index + 1}`}</strong>
                    <div style={{ fontSize: 14, color: '#475569' }}>
                      Баланс: {credit.balance ?? '—'} | Платёж: {credit.min_payment ?? '—'}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
        <label>Темп погашения</label>
        <select value={pace} onChange={(event) => setPace(event.target.value)}>{paceOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}</select>
        <label>Горизонт, месяцев</label>
        <input value={timeline} onChange={(event) => setTimeline(event.target.value)} className="text-input" />
        <button type="submit" className="btn" disabled={saving}>
          Сохранить и продолжить
        </button>
      </form>
    </div>
  );
};
