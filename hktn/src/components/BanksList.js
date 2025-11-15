import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const BanksList = ({ banks, onConnect, busyBankId }) => {
    if (!banks.length) {
        return (_jsx("div", { className: "card", children: _jsx("p", { children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0431\u0430\u043D\u043A\u043E\u0432 \u043F\u0443\u0441\u0442. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0431\u044D\u043A\u0435\u043D\u0434\u0430." }) }));
    }
    return (_jsx("div", { className: "grid grid-two", children: banks.map((bank) => (_jsxs("div", { className: "card", children: [_jsx("h3", { children: bank.name }), _jsxs("p", { style: { marginTop: 4, color: '#475569' }, children: ["Base URL: ", bank.baseUrl || 'не указан'] }), bank.error ? (_jsx("p", { style: { color: '#dc2626' }, children: bank.error })) : (_jsx("p", { style: { color: bank.connected ? '#16a34a' : '#475569' }, children: bank.connected ? 'Уже подключён' : 'Ожидает подключения' })), _jsx("button", { type: "button", className: "btn", disabled: !!bank.error || bank.connected || busyBankId === bank.id, onClick: () => onConnect(bank), children: bank.connected ? 'Готово' : busyBankId === bank.id ? 'Создание...' : 'Connect' })] }, bank.id))) }));
};
