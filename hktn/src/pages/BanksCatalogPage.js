import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
export const BanksCatalogPage = () => {
    const { userId, banks, refreshBanks, isFetchingBanks } = useUser();
    const { notifyError } = useNotifications();
    const navigate = useNavigate();
    const [selectedBankIds, setSelectedBankIds] = useState(new Set());
    useEffect(() => {
        if (userId) {
            refreshBanks();
        }
    }, [userId, refreshBanks]);
    const handleToggleBank = (bankId) => {
        setSelectedBankIds((prev) => {
            const next = new Set(prev);
            if (next.has(bankId)) {
                next.delete(bankId);
            }
            else {
                next.add(bankId);
            }
            return next;
        });
    };
    const handleSubmit = () => {
        if (selectedBankIds.size === 0) {
            notifyError('Выберите хотя бы один банк');
            return;
        }
        const selectedBanks = banks.filter((bank) => selectedBankIds.has(bank.id));
        navigate('/onboarding/consent', { state: { selectedBanks } });
    };
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0428\u0430\u0433 2. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u0430\u043D\u043A\u0438" }), _jsx("p", { children: "\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u0431\u0430\u043D\u043A\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043B\u044F \u0430\u043D\u0430\u043B\u0438\u0437\u0430." })] }), isFetchingBanks && (_jsx("div", { className: "card", children: _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043F\u0438\u0441\u043A\u0430 \u0431\u0430\u043D\u043A\u043E\u0432..." }) })), !isFetchingBanks && banks.length === 0 && (_jsx("div", { className: "card", children: _jsx("p", { children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0431\u0430\u043D\u043A\u043E\u0432 \u043F\u0443\u0441\u0442. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0431\u044D\u043A\u0435\u043D\u0434\u0430." }) })), banks.length > 0 && (_jsx("div", { className: "card", children: banks.map((bank, index) => (_jsx("div", { style: { padding: '12px 0', borderBottom: index === banks.length - 1 ? 'none' : '1px solid #eee' }, children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: selectedBankIds.has(bank.id), onChange: () => handleToggleBank(bank.id), disabled: bank.connected }), _jsxs("div", { children: [_jsx("strong", { children: bank.name }), _jsx("p", { style: { margin: 0, fontSize: 14, color: bank.connected ? '#16a34a' : '#475569' }, children: bank.connected ? 'Уже подключён' : 'Готов к подключению' })] })] }) }, bank.id))) })), _jsx("button", { className: "btn", onClick: handleSubmit, disabled: selectedBankIds.size === 0 || isFetchingBanks, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }));
};
