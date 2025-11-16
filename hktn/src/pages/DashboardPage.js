import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useUser } from '../state/useUser';
import { useNotifications } from '../state/notifications';
const formatCurrency = (value) => {
    if (value === null || value === undefined) {
        return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
    }).format(value);
};
const formatDate = (value) => {
    if (!value)
        return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
    });
};
const STSCard = ({ data }) => {
    const context = data.safe_to_spend_context;
    const narrative = data.safe_to_spend_narrative;
    const hasValue = typeof data.safe_to_spend_daily === 'number' && !Number.isNaN(data.safe_to_spend_daily ?? NaN);
    const cycleEndLabel = narrative?.cycle_end ? formatDate(narrative.cycle_end) : null;
    const balanceValue = narrative?.current_balance ?? data.current_balance;
    const obligationsValue = narrative?.obligations_total ?? 0;
    const spendableValue = narrative?.spendable_total ?? null;
    const isBalanceLow = hasValue && typeof balanceValue === 'number' && typeof data.safe_to_spend_daily === 'number'
        ? balanceValue < data.safe_to_spend_daily
        : false;
    return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Safe-to-Spend" }), _jsx("p", { className: "muted", children: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0434\u043D\u0435\u0432\u043D\u043E\u0439 \u043B\u0438\u043C\u0438\u0442 \u0434\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B." }), context?.message ? (_jsx("div", { className: `callout callout--${context.state === 'missing_balance' ? 'warning' : 'info'}`, children: context.message })) : null, _jsxs("p", { className: "metric", children: [hasValue ? formatCurrency(data.safe_to_spend_daily ?? undefined) : 'Нет оценки', _jsx("span", { children: " / \u0434\u0435\u043D\u044C" })] }), cycleEndLabel ? (_jsxs("p", { className: "muted", children: ["\u0411\u044E\u0434\u0436\u0435\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043E ", _jsx("strong", { children: cycleEndLabel }), "."] })) : null, isBalanceLow && (_jsxs("div", { className: "callout callout--warning", children: ["\u0411\u0430\u043B\u0430\u043D\u0441 (", formatCurrency(balanceValue), ") \u043D\u0438\u0436\u0435 \u0434\u043D\u0435\u0432\u043D\u043E\u0433\u043E \u043B\u0438\u043C\u0438\u0442\u0430. \u0421\u043E\u043A\u0440\u0430\u0442\u0438\u0442\u0435 \u0442\u0440\u0430\u0442\u044B \u0441\u0435\u0433\u043E\u0434\u043D\u044F."] })), _jsxs("div", { className: "safe-obligations", children: [_jsxs("div", { children: ["\u0411\u0430\u043B\u0430\u043D\u0441: ", formatCurrency(balanceValue)] }), _jsxs("div", { children: ["\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u0432 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0435: ", formatCurrency(obligationsValue)] }), _jsxs("div", { children: ["\u0420\u0435\u0437\u0435\u0440\u0432 \u043D\u0430 \u0446\u0435\u043B\u044C: ", formatCurrency(narrative?.goal_reserve)] }), _jsxs("div", { children: ["\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043D\u0430 \u0446\u0438\u043A\u043B: ", formatCurrency(spendableValue)] })] })] }));
};
const UpcomingEventsCard = ({ events, narrative }) => {
    const cycleEndLabel = narrative?.cycle_end ? formatDate(narrative.cycle_end) : '—';
    const items = events ?? [];
    const nextIncome = narrative?.next_income_event;
    return (_jsxs("div", { className: "card", children: [_jsxs("h3", { children: ["\u0414\u043E \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B (", cycleEndLabel, ")"] }), _jsxs("ul", { className: "list", children: [_jsx("li", { className: "event-row", children: _jsxs("div", { className: "event-row__header", children: [_jsxs("div", { children: [_jsx("p", { className: "event-row__title", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0431\u0430\u043B\u0430\u043D\u0441" }), _jsx("p", { className: "event-row__subtitle", children: formatDate(narrative?.cycle_start) })] }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(narrative?.current_balance) }) })] }) }), items.length > 0 ? (items.map((event, index) => (_jsx("li", { className: `event-row ${event.is_income ? 'event-row--income' : 'event-row--expense'}`, children: _jsxs("div", { className: "event-row__header", children: [_jsxs("div", { children: [_jsx("p", { className: "event-row__title", children: event.name }), _jsx("p", { className: "event-row__subtitle", children: formatDate(event.date) })] }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(event.amount) }) })] }) }, `${event.name}-${index}`)))) : (_jsx("li", { className: "muted", children: "\u041D\u0435\u0442 \u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439 \u0432 \u044D\u0442\u043E\u043C \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0435." })), nextIncome ? (_jsx("li", { className: "event-row event-row--income", children: _jsxs("div", { className: "event-row__header", children: [_jsxs("div", { children: [_jsx("p", { className: "event-row__title", children: nextIncome.label ?? 'Доход' }), _jsx("p", { className: "event-row__subtitle", children: formatDate(nextIncome.next_occurrence) })] }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(nextIncome.amount) }) })] }) })) : null] })] }));
};
const BudgetCard = ({ budget, narrative }) => (_jsxs("div", { className: "card", children: [_jsxs("h3", { children: ["\u0412\u0430\u0448 \u0431\u044E\u0434\u0436\u0435\u0442 \u043D\u0430 \u0436\u0438\u0437\u043D\u044C (", narrative?.days_in_cycle ?? 0, " \u0434.)"] }), _jsx("p", { className: "muted", children: "\u041F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u043C \u0442\u0430\u043A \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0430 \u0434\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0432\u044B\u043F\u043B\u0430\u0442\u044B." }), _jsxs("ul", { className: "list", children: [_jsx("li", { className: "event-row event-row--expense", children: _jsxs("div", { className: "event-row__header", children: [_jsx("div", { children: _jsx("p", { className: "event-row__title", children: "\u0412\u0441\u0435\u0433\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E" }) }), _jsx("div", { className: "event-row__amount", children: _jsx("strong", { children: formatCurrency(narrative?.spendable_total) }) })] }) }), budget && budget.length > 0 ? (budget.map((item, index) => (_jsx("li", { className: "event-row event-row--expense", children: _jsxs("div", { className: "event-row__header", children: [_jsx("div", { children: _jsx("p", { className: "event-row__title", children: item.category }) }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(item.amount) }) })] }) }, `${item.category}-${index}`)))) : (_jsx("li", { className: "muted", children: "\u041D\u0435\u0442 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0442\u0440\u0430\u0442 \u0434\u043B\u044F \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F." })), _jsx("li", { className: "event-row event-row--income", children: _jsxs("div", { className: "event-row__header", children: [_jsx("div", { children: _jsx("p", { className: "event-row__title", children: "\u0420\u0435\u0437\u0435\u0440\u0432 \u043D\u0430 \u0446\u0435\u043B\u044C" }) }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(narrative?.goal_reserve) }) })] }) })] })] }));
const RecurringEventsCard = ({ events }) => (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "\u0424\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0438" }), _jsx("ul", { className: "list", children: events && events.length > 0 ? (events.map((event, index) => (_jsx("li", { className: `event-row ${event.is_income ? 'event-row--income' : 'event-row--expense'}`, children: _jsxs("div", { className: "event-row__header", children: [_jsxs("div", { children: [_jsx("p", { className: "event-row__title", children: event.name }), _jsxs("p", { className: "event-row__subtitle", children: ["\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435: ", formatDate(event.next_date)] })] }), _jsx("div", { className: "event-row__amount", children: _jsx("span", { children: formatCurrency(event.amount) }) })] }) }, `${event.name}-${index}`)))) : (_jsx("li", { className: "muted", children: "\u041F\u043E\u043A\u0430 \u043D\u0435 \u043D\u0430\u0448\u043B\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0438\u0445\u0441\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u0439." })) })] }));
export const DashboardPage = () => {
    const { userId } = useUser();
    const { notifyError } = useNotifications();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!userId)
            return;
        const load = async () => {
            try {
                setLoading(true);
                const payload = await getDashboard(userId);
                setData(payload);
            }
            catch (error) {
                console.error(error);
                notifyError('Не удалось загрузить данные для дашборда.');
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, [notifyError, userId]);
    if (loading) {
        return (_jsx("div", { className: "app-main", children: _jsx("div", { className: "card", children: _jsx("p", { children: "\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u043C \u0432\u0430\u0448\u0438 \u0444\u0438\u043D\u0430\u043D\u0441\u044B \u0438 \u0441\u0442\u0440\u043E\u0438\u043C \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u044B..." }) }) }));
    }
    if (!data) {
        return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" }), _jsx("p", { children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0443. \u041F\u0440\u043E\u0439\u0434\u0438\u0442\u0435 \u043E\u043D\u0431\u043E\u0440\u0434\u0438\u043D\u0433 \u0435\u0449\u0451 \u0440\u0430\u0437." })] }) }));
    }
    return (_jsxs("div", { className: "app-main", children: [_jsx(STSCard, { data: data }), _jsxs("div", { className: "grid grid-two", children: [_jsx(UpcomingEventsCard, { events: data.upcoming_events, narrative: data.safe_to_spend_narrative }), _jsx(BudgetCard, { budget: data.budget_breakdown, narrative: data.safe_to_spend_narrative })] }), _jsx(RecurringEventsCard, { events: data.recurring_events })] }));
};
export default DashboardPage;
