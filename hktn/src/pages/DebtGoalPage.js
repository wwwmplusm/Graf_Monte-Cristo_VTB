import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCredits, saveGoal } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
const paceOptions = [
    { value: 'conservative', label: 'Мягкий' },
    { value: 'optimal', label: 'Оптимальный' },
    { value: 'fast', label: 'Агрессивный' },
];
export const DebtGoalPage = () => {
    const { userId } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const navigate = useNavigate();
    const [credits, setCredits] = useState([]);
    const [selected, setSelected] = useState({});
    const [pace, setPace] = useState('optimal');
    const [timeline, setTimeline] = useState('12');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        const load = async () => {
            if (!userId)
                return;
            try {
                setLoading(true);
                const response = await getCredits(userId);
                setCredits(response.credits ?? []);
            }
            catch (error) {
                console.error(error);
                notifyError('Не удалось получить список кредитов');
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, [notifyError, userId]);
    const toggle = (creditId) => {
        setSelected((prev) => ({ ...prev, [creditId]: !prev[creditId] }));
    };
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!userId)
            return;
        const chosen = Object.entries(selected)
            .filter(([, checked]) => checked)
            .map(([creditId]) => creditId);
        try {
            setSaving(true);
            await saveGoal({
                user_id: userId,
                goal_type: 'pay_debts',
                goal_details: {
                    close_speed: pace,
                    close_loan_ids: chosen,
                    timeline_months: Number(timeline),
                },
            });
            notifySuccess('Цель сохранена');
            navigate('/ingest');
        }
        catch (error) {
            console.error(error);
            notifyError('Не удалось сохранить цель');
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx("div", { className: "app-main", children: _jsxs("form", { className: "card", onSubmit: handleSubmit, children: [_jsx("h2", { children: "\u041A\u0430\u043A\u0438\u0435 \u043A\u0440\u0435\u0434\u0438\u0442\u044B \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0435\u043C?" }), loading ? _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u0440\u0435\u0434\u0438\u0442\u043E\u0432..." }) : null, _jsx("ul", { className: "list", children: credits.map((credit, index) => {
                        const creditId = credit.id ?? `${credit.bank_id}-${index}`;
                        return (_jsx("li", { children: _jsxs("label", { style: { display: 'flex', gap: 12 }, children: [_jsx("input", { type: "checkbox", checked: selected[creditId] ?? false, onChange: () => toggle(creditId) }), _jsxs("div", { children: [_jsx("strong", { children: credit.name ?? `Кредит ${index + 1}` }), _jsxs("div", { style: { fontSize: 14, color: '#475569' }, children: ["\u0411\u0430\u043B\u0430\u043D\u0441: ", credit.balance ?? '—', " | \u041F\u043B\u0430\u0442\u0451\u0436: ", credit.min_payment ?? '—'] })] })] }) }, creditId));
                    }) }), _jsx("label", { children: "\u0422\u0435\u043C\u043F \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u044F" }), _jsx("select", { value: pace, onChange: (event) => setPace(event.target.value), children: paceOptions.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }), _jsx("label", { children: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442, \u043C\u0435\u0441\u044F\u0446\u0435\u0432" }), _jsx("input", { value: timeline, onChange: (event) => setTimeline(event.target.value), className: "text-input" }), _jsx("button", { type: "submit", className: "btn", disabled: saving, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }) }));
};
