import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveGoal } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

const paceOptions = [
  { value: 'conservative', label: 'Консервативный' },
  { value: 'optimal', label: 'Оптимальный' },
  { value: 'fast', label: 'Быстрый' },
];

export const SaveGoalPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('100000');
  const [pace, setPace] = useState('optimal');
  const [monthly, setMonthly] = useState('20000');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    try {
      setSaving(true);
      await saveGoal({
        user_id: userId,
        goal_type: 'save_money',
        goal_details: {
          save_amount: Number(amount),
          save_speed: pace,
          monthly_contribution: Number(monthly),
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
        <h2>Сколько хотите отложить?</h2>
        <label>Целевая сумма, ₽</label>
        <input value={amount} onChange={(event) => setAmount(event.target.value)} className="text-input" />
        <label>Темп накопления</label>
        <select value={pace} onChange={(event) => setPace(event.target.value)}>
          {paceOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label>Ежемесячный вклад, ₽</label>
        <input value={monthly} onChange={(event) => setMonthly(event.target.value)} className="text-input" />
        <button type="submit" className="btn" disabled={saving}>
          Сохранить и продолжить
        </button>
      </form>
    </div>
  );
};
