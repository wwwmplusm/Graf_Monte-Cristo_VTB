import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const formatCurrency = (value) => {
    if (value === null || value === undefined)
        return '—';
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
    }).format(value);
};
const formatTimestamp = (value) => {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'long',
    });
};
const STATUS_LABELS = {
    ok: { label: 'OK', tone: 'ok' },
    error: { label: 'Ошибка', tone: 'error' },
};
const toneClass = (tone) => (tone === 'error' ? 'status-pill status-pill--error' : 'status-pill');
export const BanksOverviewCard = ({ totalBalance, bankStatuses }) => {
    const entries = bankStatuses ?? [];
    return (_jsxs("div", { className: "card banks-overview", children: [_jsx("h2", { children: "\u0411\u0430\u043B\u0430\u043D\u0441 \u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0445" }), _jsx("p", { className: "muted", children: "\u0421\u0443\u043C\u043C\u0430 \u043D\u0430 \u0432\u0441\u0435\u0445 \u0441\u0447\u0435\u0442\u0430\u0445 \u0432 \u0431\u0430\u043D\u043A\u0430\u0445, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0438 \u043D\u0430 \u043D\u0430\u0448 \u0437\u0430\u043F\u0440\u043E\u0441." }), _jsx("div", { className: "banks-overview__summary", children: _jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0431\u0430\u043B\u0430\u043D\u0441" }), _jsx("p", { className: "metric", children: formatCurrency(totalBalance) })] }) }), _jsx("div", { className: "banks-overview__list", children: entries.length === 0 ? (_jsx("p", { className: "muted", children: "\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0445 \u0431\u0430\u043D\u043A\u043E\u0432." })) : (entries.map((entry) => {
                    const statusInfo = STATUS_LABELS[entry.status] ?? { label: 'НЕИЗВЕСТНО', tone: 'error' };
                    return (_jsxs("div", { className: "banks-overview__row", children: [_jsxs("div", { children: [_jsx("p", { className: "banks-overview__bank", children: entry.bank_name }), _jsxs("p", { className: "banks-overview__message", children: ["\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ", formatTimestamp(entry.fetched_at)] })] }), _jsx("span", { className: toneClass(statusInfo.tone), children: statusInfo.label })] }, entry.bank_id));
                })) })] }));
};
export default BanksOverviewCard;
