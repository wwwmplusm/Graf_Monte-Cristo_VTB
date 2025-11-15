import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
export const DashboardPage = () => {
    const { userId } = useUser();
    const { notifyError } = useNotifications();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        const load = async () => {
            if (!userId)
                return;
            try {
                setLoading(true);
                const payload = await getDashboard(userId);
                setData(payload);
            }
            catch (error) {
                console.error(error);
                notifyError('Не удалось получить аналитику');
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, [notifyError, userId]);
    if (loading) {
        return (_jsx("div", { className: "app-main", children: _jsx("div", { className: "card", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0438..." }) }));
    }
    if (!data) {
        return (_jsx("div", { className: "app-main", children: _jsx("div", { className: "card", children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445. \u041F\u0440\u043E\u0439\u0434\u0438\u0442\u0435 \u043E\u043D\u0431\u043E\u0440\u0434\u0438\u043D\u0433." }) }));
    }
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Safe-to-Spend" }), _jsxs("p", { children: [data.safe_to_spend_daily ? `${data.safe_to_spend_daily} ₽ в день` : 'Нет расчёта', ' | ', "\u0412\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C \u0446\u0435\u043B\u0438: ", data.goal_probability ?? 0, "%"] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "\u041F\u0440\u0435\u0434\u0441\u0442\u043E\u044F\u0449\u0438\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0438" }), _jsx("ul", { className: "list", children: (data.upcoming_payments ?? []).map((payment, index) => (_jsxs("li", { children: [payment.name, ": ", payment.amount ?? '—', " \u20BD \u0434\u043E ", payment.date ?? '—'] }, `${payment.name}-${index}`))) })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "\u041F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0438\u0435\u0441\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u044F" }), _jsx("ul", { className: "list", children: (data.recurring_events ?? []).map((event, index) => (_jsxs("li", { children: [event.name, ": ", event.amount ?? '—', " \u20BD ", event.is_income ? '(доход)' : '(расход)', " \u2192 ", event.next_date] }, `${event.name}-${index}`))) })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "\u041A\u0440\u0435\u0434\u0438\u0442\u044B" }), _jsx("ul", { className: "list", children: (data.credit_rankings ?? []).map((credit) => (_jsxs("li", { children: [credit.name, ": ", credit.balance, " \u20BD | \u041F\u043B\u0430\u0442\u0451\u0436 ", credit.min_payment, " \u20BD | Stress ", credit.stress_score] }, credit.name))) })] })] }));
};
