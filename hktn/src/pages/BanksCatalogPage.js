import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { BanksList } from '../components/BanksList';
import { useUser } from '../state/useUser';
export const BanksCatalogPage = () => {
    const { userId, banks, refreshBanks, isFetchingBanks } = useUser();
    useEffect(() => {
        if (userId) {
            refreshBanks();
        }
    }, [userId, refreshBanks]);
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0411\u0430\u043D\u043A\u043E\u0432\u0441\u043A\u0438\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F" }), _jsx("p", { children: "\u0421\u043F\u0438\u0441\u043E\u043A \u0431\u0430\u043D\u043A\u043E\u0432, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0434\u043B\u044F \u0440\u0430\u0441\u0447\u0451\u0442\u0430 Safe-to-Spend." })] }), isFetchingBanks ? (_jsx("div", { className: "card", children: _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E \u043E \u0431\u0430\u043D\u043A\u0430\u0445..." }) })) : (_jsx(BanksList, { banks: banks }))] }));
};
