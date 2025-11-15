import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export const USER_ID_PATTERN = /^team260-([1-9]|10)$/i;
export const validateUserId = (value) => USER_ID_PATTERN.test(value.trim());
export const UserIdForm = ({ defaultUserId = '', defaultUserName = '', onSubmit, isSubmitting, }) => {
    const [userId, setUserId] = useState(defaultUserId ?? '');
    const [userName, setUserName] = useState(defaultUserName ?? '');
    const [agreed, setAgreed] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmedId = userId.trim();
        const trimmedName = userName.trim();
        if (!validateUserId(trimmedId)) {
            setError('ID должен быть в формате team260-X, где X от 1 до 10');
            return;
        }
        if (!trimmedName) {
            setError('Пожалуйста, введите ваше имя');
            return;
        }
        if (!agreed) {
            setError('Необходимо согласиться на обработку персональных данных');
            return;
        }
        setError(null);
        await onSubmit(trimmedId, trimmedName);
    };
    return (_jsxs("form", { className: "card", onSubmit: handleSubmit, children: [_jsx("h2", { children: "\u0428\u0430\u0433 1. \u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F" }), _jsx("p", { children: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u0430\u0448 ID \u0438 \u0438\u043C\u044F \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0431\u043E\u0442\u044B." }), _jsx("label", { htmlFor: "user-id-input", children: "User ID" }), _jsx("input", { id: "user-id-input", value: userId, onChange: (e) => setUserId(e.target.value), placeholder: "team260-1", className: "text-input", disabled: isSubmitting }), _jsx("label", { htmlFor: "user-name-input", children: "\u0412\u0430\u0448\u0435 \u0438\u043C\u044F" }), _jsx("input", { id: "user-name-input", value: userName, onChange: (e) => setUserName(e.target.value), placeholder: "\u0418\u0432\u0430\u043D \u0418\u0432\u0430\u043D\u043E\u0432", className: "text-input", disabled: isSubmitting }), _jsxs("label", { style: { display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0' }, children: [_jsx("input", { type: "checkbox", checked: agreed, onChange: (e) => setAgreed(e.target.checked) }), _jsx("span", { children: "\u042F \u0441\u043E\u0433\u043B\u0430\u0441\u0435\u043D \u043D\u0430 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445" })] }), error ? (_jsx("p", { role: "alert", style: { color: '#dc2626', marginTop: 8 }, children: error })) : null, _jsx("button", { type: "submit", className: "btn", disabled: isSubmitting || !agreed, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }));
};
