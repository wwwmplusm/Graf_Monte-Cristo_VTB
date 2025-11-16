import React, { useEffect, useState } from 'react';
import { getIntegrationStatus } from '../api/client';
import type {
  BankPipelineStatus,
  IntegrationStatusResponse,
  PipelineStatus,
  StepStatus,
} from '../types/integration-status';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

const pipelineStatusLabels: Record<PipelineStatus, string> = {
  ok: 'Всё в порядке',
  partial: 'Частично',
  error: 'Ошибка',
};

const stepStatusLabels: Record<StepStatus, string> = {
  ok: 'OK',
  no_data: 'Нет данных',
  no_access: 'Нет доступа',
  error: 'Ошибка',
};

const formatCurrency = (value?: number | null, currency = 'RUB') => {
  if (value === undefined || value === null) {
    return '—';
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
};

const BankStatusCard: React.FC<{ bank: BankPipelineStatus }> = ({ bank }) => (
  <div className="card status-card">
    <div className="status-card__header">
      <div>
        <h3>{bank.bank_name}</h3>
        <p className="muted">ID: {bank.bank_id}</p>
      </div>
      <span className={`status-chip status-chip--${bank.pipeline_status}`}>
        {pipelineStatusLabels[bank.pipeline_status]}
      </span>
    </div>

    <div className="bank-steps">
      {bank.steps.map((step) => (
        <div key={`${bank.bank_id}-${step.name}`} className="bank-step">
          <div className="bank-step__header">
            <span>{step.name}</span>
            <span className={`status-chip status-chip--${step.status}`}>{stepStatusLabels[step.status]}</span>
          </div>
          <p className="muted">{step.details}</p>
          {step.error_code ? <p className="muted">Подробности: {step.error_code}</p> : null}
        </div>
      ))}
    </div>

    <div className="bank-status__metrics">
      <p className="muted">
        Балансы: {formatCurrency(bank.raw_metrics.sum_account_balances)} ({bank.raw_metrics.used_in_base_score ? 'учтён в BaseScore' : 'не учитывается'})
      </p>
      <p className="muted">
        Кредиты: {formatCurrency(bank.raw_metrics.sum_credit_debts)}{' '}
        {bank.raw_metrics.sum_credit_debts > 0 ? '(учтены)' : '(не найдены)'}
      </p>
    </div>
  </div>
);

export const IntegrationStatusPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError } = useNotifications();
  const [data, setData] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    getIntegrationStatus(userId)
      .then((payload) => setData(payload))
      .catch((err) => {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Не удалось загрузить данные';
        setError(message);
        notifyError('Не удалось загрузить диагностику API.');
      })
      .finally(() => setLoading(false));
  }, [notifyError, userId]);

  if (!userId) {
    return null;
  }

  return (
    <div className="app-main">
      {loading && (
        <div className="card">
          <p>Загружаем статус интеграций...</p>
        </div>
      )}

      {error && !loading && (
        <div className="card">
          <h2>Статус недоступен</h2>
          <p>{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          <div className="card">
            <h2>BaseScore</h2>
            {data.base_score.status === 'ok' ? (
              <>
                <p className="metric">{formatCurrency(data.base_score.value, data.base_score.currency)}</p>
                <p className="muted">{data.base_score.reason}</p>
              </>
            ) : (
              <p className="muted">Не удалось посчитать базовый коэффициент: {data.base_score.reason}</p>
            )}
          </div>

          {data.banks.length === 0 ? (
            <div className="card">
              <p>Нет подключённых банков.</p>
            </div>
          ) : (
            <div className="grid grid-two bank-status-grid">
              {data.banks.map((bank) => (
                <BankStatusCard key={bank.bank_id} bank={bank} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IntegrationStatusPage;
