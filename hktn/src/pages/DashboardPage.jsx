import React, { useEffect, useMemo, useState } from 'react';
import { getDashboard, getFinancialPortrait } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return currencyFormatter.format(value);
};

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
};

const SOURCE_COPY = {
  credit_agreement: { label: 'Кредит', tone: 'credit' },
  recurring_debit: { label: 'Регулярный расход', tone: 'debit' },
  expense_event: { label: 'Расход (AI)', tone: 'debit' },
  recurring_income: { label: 'Регулярный доход', tone: 'income' },
  income_event: { label: 'Доход (AI)', tone: 'income' },
};

const sanitizeSourceKey = (source) => source.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const SourceChip = ({ source }) => {
  if (!source) return null;
  const descriptor = SOURCE_COPY[source] ?? { label: source.replace(/_/g, ' '), tone: 'neutral' };
  const chipClass = `chip chip--source chip--${descriptor.tone} chip--${sanitizeSourceKey(source)}`;
  return (
    <span className={chipClass} aria-label={`Источник: ${descriptor.label}`}>
      {descriptor.label}
    </span>
  );
};

const MetadataBadges = ({ mcc, category, merchantName, bankTransactionCode, source, isIncome }) => {
  const merchantLabel = merchantName || (isIncome ? 'Источник дохода не опознан' : 'Неизвестный торговец');
  return (
    <div className="metadata-badges" aria-label="Дополнительные атрибуты события">
      <span className="metadata-badge metadata-badge--merchant" title={merchantLabel}>
        {merchantLabel}
      </span>
      <span className="metadata-badge metadata-badge--mcc" title={`MCC ${mcc || '—'}`}>
        {`MCC ${mcc || '—'}${category ? ` • ${category}` : ''}`}
      </span>
      {bankTransactionCode ? (
        <span
          className="metadata-badge metadata-badge--code"
          title={`Банковский код транзакции: ${bankTransactionCode}`}
          aria-label={bankTransactionCode}
        >
          {bankTransactionCode}
        </span>
      ) : (
        <span className="metadata-badge metadata-badge--muted" aria-label="Код транзакции отсутствует">
          Нет кода
        </span>
      )}
      <SourceChip source={source} />
    </div>
  );
};

const RecurringEventRow = ({ event }) => (
  <li className={`event-row ${event.is_income ? 'event-row--income' : 'event-row--expense'}`}>
    <div className="event-row__header">
      <div>
        <p
          className="event-row__title"
          title={event.bank_transaction_code ? `Код транзакции: ${event.bank_transaction_code}` : undefined}
        >
          {event.name ?? 'Повторяющееся событие'}
        </p>
        <p className="event-row__subtitle">
          {event.merchant_name || (event.is_income ? 'Источник дохода неизвестен' : 'Неизвестный торговец')}
          {event.frequency_days ? ` • каждые ~${event.frequency_days} д.` : null}
        </p>
      </div>
      <div className="event-row__amount" aria-label="Размер события">
        <span>{formatCurrency(event.amount)}</span>
        <small>
          {event.is_income ? 'Следующий доход' : 'Следующий платёж'}: {formatDate(event.next_date)}
        </small>
      </div>
    </div>
    <MetadataBadges
      mcc={event.mcc_code}
      category={event.category}
      merchantName={event.merchant_name}
      bankTransactionCode={event.bank_transaction_code}
      source={event.source}
      isIncome={event.is_income}
    />
  </li>
);

const UpcomingPaymentRow = ({ payment }) => {
  const derived = payment.source && payment.source !== 'credit_agreement';
  const amount = typeof payment.amount === 'number' ? Math.abs(payment.amount) : null;
  return (
    <li className={`event-row obligation-row ${derived ? 'obligation-row--derived' : ''}`}>
      <div className="event-row__header">
        <div>
          <p
            className="event-row__title"
            title={payment.bank_transaction_code ? `Код транзакции: ${payment.bank_transaction_code}` : undefined}
          >
            {payment.name || 'Обязательный платёж'}
          </p>
          <p className="event-row__subtitle">Срок: {formatDate(payment.due_date)}</p>
        </div>
        <div className="event-row__amount">
          <span>{formatCurrency(amount)}</span>
          <small>Источник: {payment.source ? SOURCE_COPY[payment.source]?.label || payment.source : '—'}</small>
        </div>
      </div>
      {derived ? <span className="chip chip--derived">AI-обязательство</span> : null}
      <MetadataBadges
        mcc={payment.mcc_code}
        category={payment.category}
        merchantName={payment.merchant_name}
        bankTransactionCode={payment.bank_transaction_code}
        source={payment.source}
      />
    </li>
  );
};

export const DashboardPage = ({ initialData = null }) => {
  const { userId } = useUser();
  const { notifyError } = useNotifications();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portrait, setPortrait] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [mccFilter, setMccFilter] = useState('all');
  const [sortMode, setSortMode] = useState('due_date');

  useEffect(() => {
    if (!userId || initialData) {
      return;
    }
    const load = async () => {
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
  }, [notifyError, userId, initialData]);

  useEffect(() => {
    if (!portraitOpen || portrait || !userId) {
      return;
    }
    const load = async () => {
      try {
        setPortraitLoading(true);
        const payload = await getFinancialPortrait({ user_id: userId });
        setPortrait(payload);
      } catch (error) {
        console.error(error);
        notifyError('Не удалось получить подробный портрет');
      } finally {
        setPortraitLoading(false);
      }
    };
    load();
  }, [portraitOpen, portrait, userId, notifyError]);

  const upcomingPayments = useMemo(() => {
    const parsed = [...(data?.upcoming_payments ?? [])];
    return parsed
      .map((item) => ({
        ...item,
        due_date: item.due_date ?? item.date ?? '',
      }))
      .sort((a, b) => {
        const aTime = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [data]);

  const recurringEvents = data?.recurring_events ?? [];
  const uniqueSources = useMemo(() => {
    const values = new Set();
    upcomingPayments.forEach((item) => {
      if (item.source) values.add(item.source);
    });
    return Array.from(values);
  }, [upcomingPayments]);

  const uniqueMccCodes = useMemo(() => {
    const values = new Set();
    upcomingPayments.forEach((item) => {
      if (item.mcc_code) values.add(item.mcc_code);
    });
    return Array.from(values);
  }, [upcomingPayments]);

  const filteredPayments = useMemo(() => {
    const filtered = upcomingPayments.filter((item) => {
      if (sourceFilter !== 'all' && (item.source || 'none') !== sourceFilter) {
        return false;
      }
      if (mccFilter !== 'all' && (item.mcc_code || 'none') !== mccFilter) {
        return false;
      }
      return true;
    });
    if (sortMode === 'amount') {
      return [...filtered].sort((a, b) => {
        const aAmount = typeof a.amount === 'number' ? a.amount : 0;
        const bAmount = typeof b.amount === 'number' ? b.amount : 0;
        return bAmount - aAmount;
      });
    }
    return filtered;
  }, [upcomingPayments, sourceFilter, mccFilter, sortMode]);

  const safeToSpend = data?.safe_to_spend ?? null;
  const safeToSpendDaily = data?.safe_to_spend_daily ?? (safeToSpend ? Math.max(0, Math.round(safeToSpend / 30)) : null);
  const currentBalance = data?.current_balance ?? 0;
  const topObligations = upcomingPayments.slice(0, 3);
  const obligationsTotal = upcomingPayments.reduce(
    (acc, item) => acc + (typeof item.amount === 'number' ? item.amount : 0),
    0
  );
  const recommendedPaymentDate = data?.analysis?.payment_date;
  const recommendationDateLabel = recommendedPaymentDate ? formatDate(String(recommendedPaymentDate)) : '—';
  const recommendedPaymentAmount = data?.analysis?.payment_amount;
  const portraitEvents = portrait?.recurring_events ?? recurringEvents;
  const portraitTransactions = portrait?.transactions_sample ?? [];
  const mccCoverage = portraitEvents.length
    ? Math.round((portraitEvents.filter((event) => Boolean(event.mcc_code)).length / portraitEvents.length) * 100)
    : 0;
  const merchantClusters = useMemo(() => {
    const map = new Map();
    portraitEvents.forEach((event) => {
      if (!event.merchant_name) return;
      const key = event.merchant_name.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([key, count]) => ({ name: key, count }))
      .sort((a, b) => b.count - a.count);
  }, [portraitEvents]);

  const renderTransactionsForEvent = (event) => {
    const matches = portraitTransactions.filter((tx) => {
      const txMerchant = tx.merchant?.name || tx.description;
      const txMcc = tx.mccCode || tx.merchant?.mccCode;
      const merchantMatch =
        !!event.merchant_name &&
        !!txMerchant &&
        txMerchant.toLowerCase().includes(event.merchant_name.toLowerCase());
      const mccMatch = !!event.mcc_code && !!txMcc && event.mcc_code === txMcc;
      return merchantMatch || mccMatch;
    });
    if (!matches.length) {
      return <p className="muted">Не нашли исторических транзакций для этой метки.</p>;
    }
    return (
      <ul className="metadata-transactions">
        {matches.slice(0, 4).map((tx) => (
          <li key={tx.transactionId}>
            <strong>{formatCurrency(tx.amount)}</strong>
            <span>{tx.bookingDate ? formatDate(tx.bookingDate) : '—'}</span>
            <span>{tx.merchant?.name || tx.description || '—'}</span>
          </li>
        ))}
      </ul>
    );
  };

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
      <div className="card safe-card">
        <div className="card-header">
          <h2>Safe-to-Spend</h2>
          <span className="chip chip--balance" aria-label="Текущий баланс">
            Баланс: {formatCurrency(currentBalance)}
          </span>
        </div>
        <p className="muted">
          Основано на {formatCurrency(currentBalance)} и {topObligations.length || '—'} обязательствах FinPulse AI.
        </p>
        <div className="safe-grid">
          <div>
            <p className="muted">Ежедневный безопасный лимит</p>
            <strong className="metric">{safeToSpendDaily ? `${formatCurrency(safeToSpendDaily)} / день` : 'Нет оценки'}</strong>
          </div>
          <div>
            <p className="muted">Горизонт (30 дн.)</p>
            <strong className="metric">{safeToSpend ? formatCurrency(safeToSpend) : 'Нет оценки'}</strong>
          </div>
          <div>
            <p className="muted">Вероятность достижения цели</p>
            <strong className="metric">{data.goal_probability ?? data.analysis?.success_probability_percent ?? 0}%</strong>
          </div>
        </div>
        {recommendedPaymentAmount ? (
          <div className="safe-recommendation">
            <span>Рекомендация: </span>
            <strong>
              {formatCurrency(recommendedPaymentAmount)} до {recommendationDateLabel}
            </strong>
            <span className="muted">{data.analysis?.recommendation}</span>
          </div>
        ) : null}
        <div className="safe-obligations">
          <p className="muted">Основные обязательства в расчёте:</p>
          <div className="metadata-badges">
            {topObligations.length ? (
              topObligations.map((item) => (
                <span key={`${item.name}-${item.due_date}`} className="metadata-badge metadata-badge--obligation">
                  {item.name}: {formatCurrency(typeof item.amount === 'number' ? item.amount : null)} до {formatDate(item.due_date)}
                </span>
              ))
            ) : (
              <span className="metadata-badge metadata-badge--muted">Нет активных обязательств</span>
            )}
          </div>
          <p className="muted">
            Всего к оплате ≈ {formatCurrency(obligationsTotal)} на горизонте Safe-to-Spend.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Предстоящие платежи</h3>
          <div className="filter-row">
            <label>
              Источник
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">Все</option>
                {uniqueSources.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_COPY[source]?.label || source}
                  </option>
                ))}
              </select>
            </label>
            <label>
              MCC
              <select value={mccFilter} onChange={(event) => setMccFilter(event.target.value)}>
                <option value="all">Все</option>
                {uniqueMccCodes.map((mcc) => (
                  <option key={mcc} value={mcc}>
                    {mcc}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сортировка
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="due_date">По дате</option>
                <option value="amount">По сумме</option>
              </select>
            </label>
          </div>
        </div>
        <ul className="list list--dense">
          {filteredPayments.length ? (
            filteredPayments.map((payment) => <UpcomingPaymentRow key={`${payment.name}-${payment.due_date}`} payment={payment} />)
          ) : (
            <li className="muted">Нет обязательств по выбранным фильтрам.</li>
          )}
        </ul>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Повторяющиеся события</h3>
          <span className="chip chip--neutral">{recurringEvents.length} поток(ов)</span>
        </div>
        <ul className="list list--dense">
          {recurringEvents.length ? (
            recurringEvents.map((event) => <RecurringEventRow key={`${event.name}-${event.next_date}`} event={event} />)
          ) : (
            <li className="muted">Нет обнаруженных повторяющихся событий.</li>
          )}
        </ul>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Кредиты</h3>
          <span className="chip chip--credit">{(data.credit_rankings ?? []).length} активных</span>
        </div>
        <ul className="list list--dense">
          {(data.credit_rankings ?? []).length ? (
            (data.credit_rankings ?? []).map((credit) => (
              <li key={credit.name} className="credit-row">
                <div>
                  <strong>{credit.name}</strong>
                  <p className="muted">Stress {credit.stress_score ?? '—'}</p>
                </div>
                <div className="credit-row__metrics">
                  <span>Долг: {formatCurrency(credit.balance)}</span>
                  <span>Платёж: {formatCurrency(credit.min_payment)}</span>
                </div>
              </li>
            ))
          ) : (
            <li className="muted">Нет кредитных продуктов.</li>
          )}
        </ul>
      </div>

      <div className="card portrait-card">
        <div className="card-header">
          <h3>Финансовый портрет</h3>
          <button className="btn btn-secondary" onClick={() => setPortraitOpen((prev) => !prev)}>
            {portraitOpen ? 'Скрыть детали' : 'Показать детали'}
          </button>
        </div>
        <p className="muted">
          Детализированная сводка MCC, торговцев и транзакций, лежащих в основе портрета. Используйте её для ручной
          проверки и отладки онбординга.
        </p>
        <div className="portrait-summary">
          <span className="metadata-badge metadata-badge--mcc" title="Доля событий с MCC">
            MCC покрытие: {mccCoverage}% событий
          </span>
          <span className="metadata-badge metadata-badge--merchant">Кластеров торговцев: {merchantClusters.length}</span>
        </div>
        {portraitOpen ? (
          <div className="portrait-details">
            {portraitLoading && <p>Загрузка портрета...</p>}
            {!portraitLoading && !portrait && <p>Нет подробных данных — попробуйте обновить позже.</p>}
            {!portraitLoading && portrait ? (
              <details open className="portrait-panel">
                <summary>Повторяющиеся события ({portraitEvents.length})</summary>
                <ul className="list list--dense">
                  {portraitEvents.map((event) => (
                    <li key={`${event.name}-${event.next_date}`} className="portrait-event">
                      <div className="portrait-event__header">
                        <div>
                          <strong>{event.name}</strong>
                          <p className="muted">
                            {event.merchant_name || 'Неизвестный торговец'} • {event.mcc_code || 'MCC —'}
                          </p>
                        </div>
                        <span>{event.is_income ? 'Доход' : 'Расход'}</span>
                      </div>
                      <MetadataBadges
                        mcc={event.mcc_code}
                        category={event.category}
                        merchantName={event.merchant_name}
                        bankTransactionCode={event.bank_transaction_code}
                        source={event.source}
                        isIncome={event.is_income}
                      />
                      <details>
                        <summary>Транзакции-кандидаты</summary>
                        {renderTransactionsForEvent(event)}
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DashboardPage;
