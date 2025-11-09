import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

type ConsentStatusPayload = {
  state: string;
  status: string;
  approval_url?: string;
  consent_id?: string;
  request_id?: string;
};

const POLL_INTERVAL_MS = 3500;

export const ConsentStatusPage: React.FC = () => {
  const { bankId } = useParams();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId') || undefined;
  const bankName = searchParams.get('bankName') ?? bankId;
  const navigate = useNavigate();
  const { userId, upsertConsent } = useUser();
  const { notifyError } = useNotifications();
  const [status, setStatus] = useState<ConsentStatusPayload | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const runPoll = useCallback(async (): Promise<ConsentStatusPayload | null> => {
    if (!userId || !bankId || !requestId) {
      return null;
    }
    try {
      setIsPolling(true);
      const payload = await pollConsent({ user_id: userId, bank_id: bankId, request_id: requestId });
      setStatus(payload);
      upsertConsent({
        bankId,
        requestId,
        consentId: payload.consent_id,
        status: payload.state,
        approvalUrl: payload.approval_url,
      });
      return payload;
    } catch (error) {
      console.error(error);
      notifyError('Не удалось обновить статус');
      return null;
    }
    finally {
      setIsPolling(false);
    }
  }, [bankId, bankName, notifyError, requestId, upsertConsent, userId]);

  useEffect(() => {
    if (!userId || !bankId || !requestId) return;
    let timer: number;
    let cancelled = false;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        const payload = await runPoll();
        if (!cancelled && payload?.state !== 'approved') {
          schedule();
        }
      }, POLL_INTERVAL_MS);
    };

    runPoll().then((payload) => {
      if (!cancelled && payload?.state !== 'approved') {
        schedule();
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bankId, requestId, runPoll, userId]);

  const canContinue = status?.state === 'approved';

  if (!bankId || !requestId) {
    return (
      <div className="app-main">
        <div className="card">
          <p>Нет активного запроса. Вернитесь к списку банков.</p>
          <button className="btn-secondary btn" onClick={() => navigate('/banks')}>
            Назад к банкам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <div className="card">
        <h2>Статус запроса в {bankName}</h2>
        <p>Статус: {status?.state ?? 'ожидание'}</p>
        <p>Ответ банка: {status?.status ?? '...'} </p>
        {status?.approval_url ? (
          <p>
            Ссылка: <a href={status.approval_url}>Открыть портал банка</a>
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="btn" onClick={runPoll} disabled={isPolling}>
            Я подтвердил
          </button>
          <button className="btn-secondary btn" onClick={() => navigate('/banks')}>
            Выбрать другой банк
          </button>
        </div>
        {canContinue ? (
          <button className="btn" style={{ marginTop: 16 }} onClick={() => navigate('/banks/preview')}>
            Перейти к продуктам
          </button>
        ) : null}
      </div>
    </div>
  );
};
