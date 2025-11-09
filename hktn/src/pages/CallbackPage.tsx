import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const CallbackPage: React.FC = () => {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const consentId = params.get('consent_id');

  return (
    <div className="app-main">
      <div className="card">
        <h2>Банк подтвердил консент</h2>
        <p>Можно закрыть вкладку банка и вернуться в приложение.</p>
        {consentId ? <p>Consent ID: {consentId}</p> : null}
        <button className="btn" onClick={() => navigate('/banks/preview')}>
          Вернуться
        </button>
      </div>
    </div>
  );
};
