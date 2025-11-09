import React from 'react';
import { useNavigate } from 'react-router-dom';

export const GoalsLandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 5. Выберите цель</h2>
        <p>Цель влияет на аналитику и рекомендации.</p>
      </div>
      <div className="grid grid-two">
        <div className="card">
          <h3>Накопить сбережения</h3>
          <p>Планирование подушки безопасности и прогноз вероятности накопления.</p>
          <button className="btn" onClick={() => navigate('/goals/save')}>
            Продолжить
          </button>
        </div>
        <div className="card">
          <h3>Закрыть кредиты</h3>
          <p>Отслеживание кредитов, сценарии выплат и приоритизация.</p>
          <button className="btn" onClick={() => navigate('/goals/debts')}>
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
};
