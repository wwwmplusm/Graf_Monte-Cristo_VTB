import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveGoal } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
const paceOptions = [
    { value: 'conservative', label: 'Консервативный' },
    { value: 'optimal', label: 'Оптимальный' },
    { value: 'fast', label: 'Быстрый' },
];
export const SaveGoalPage = () => {
    const { userId } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const navigate = useNavigate();
    const [amount, setAmount] = useState('100000');
    const [pace, setPace] = useState('optimal');
    const [monthly, setMonthly] = useState('20000');
    const [saving, setSaving] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!userId)
            return;
        try {
            setSaving(true);
            await saveGoal({
                user_id: userId,
                goal_type: 'save_money',
                goal_details: {
                    save_amount: Number(amount),
                    save_speed: pace,
                    monthly_contribution: Number(monthly),
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
    return (_jsx("div", { className: "app-main", children: _jsxs("form", { className: "card", onSubmit: handleSubmit, children: [_jsx("h2", { children: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u043E\u0442\u043B\u043E\u0436\u0438\u0442\u044C?" }), _jsx("label", { children: "\u0426\u0435\u043B\u0435\u0432\u0430\u044F \u0441\u0443\u043C\u043C\u0430, \u20BD" }), _jsx("input", { value: amount, onChange: (event) => setAmount(event.target.value), className: "text-input" }), _jsx("label", { children: "\u0422\u0435\u043C\u043F \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u0438\u044F" }), _jsx("select", { value: pace, onChange: (event) => setPace(event.target.value), children: paceOptions.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }), _jsx("label", { children: "\u0415\u0436\u0435\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0432\u043A\u043B\u0430\u0434, \u20BD" }), _jsx("input", { value: monthly, onChange: (event) => setMonthly(event.target.value), className: "text-input" }), _jsx("button", { type: "submit", className: "btn", disabled: saving, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }) }));
};
