import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useUser } from '../state/useUser';
import { useNotifications } from '../state/notifications';
import { BanksOverviewCard } from '../components/BanksOverviewCard';
const formatCurrency = (value) => {
    if (value === null || value === undefined)
        return '—';
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
    return parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};
const STSCard = ({ data }) => {
    const nextSalaryLabel = formatDate(data.next_salary_date);
    const creditPaymentLabel = formatDate(data.upcoming_credit_payment?.next_payment_date);
    return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Safe-to-Spend" }), _jsxs("p", { className: "muted", children: ["\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0434\u043D\u0435\u0432\u043D\u043E\u0439 \u043B\u0438\u043C\u0438\u0442 \u0434\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B (", nextSalaryLabel, ")."] }), _jsxs("p", { className: "metric", children: [formatCurrency(data.safe_to_spend_daily), _jsx("span", { children: " / \u0434\u0435\u043D\u044C" })] }), _jsxs("div", { className: "safe-obligations", children: [_jsxs("div", { children: ["\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430: ", _jsx("strong", { children: formatCurrency(data.salary_amount) })] }), _jsxs("div", { children: ["\u0414\u043D\u0435\u0439 \u0434\u043E \u0432\u044B\u043F\u043B\u0430\u0442\u044B: ", _jsx("strong", { children: data.days_until_next_salary })] }), _jsxs("div", { children: ["\u0411\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0439 \u043F\u043B\u0430\u0442\u0451\u0436 \u043F\u043E \u043A\u0440\u0435\u0434\u0438\u0442\u0443: ", formatCurrency(data.upcoming_credit_payment?.amount), " (", creditPaymentLabel, ")"] })] })] }));
};
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
        return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" }), _jsx("p", { children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0443. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043D\u0443\u0436\u043D\u043E \u043F\u0440\u043E\u0439\u0442\u0438 \u043E\u043D\u0431\u043E\u0440\u0434\u0438\u043D\u0433 \u0437\u0430\u043D\u043E\u0432\u043E." })] }) }));
    }
    return (_jsxs("div", { className: "app-main", children: [_jsx(STSCard, { data: data }), _jsx(BanksOverviewCard, { totalBalance: data.total_balance, bankStatuses: data.bank_statuses })] }));
};
export default DashboardPage;
