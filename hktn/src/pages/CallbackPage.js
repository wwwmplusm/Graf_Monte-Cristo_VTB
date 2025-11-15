import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, useNavigate } from 'react-router-dom';
export const CallbackPage = () => {
    const { search } = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(search);
    const consentId = params.get('consent_id');
    return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0411\u0430\u043D\u043A \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B \u043A\u043E\u043D\u0441\u0435\u043D\u0442" }), _jsx("p", { children: "\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0431\u0430\u043D\u043A\u0430 \u0438 \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435." }), consentId ? _jsxs("p", { children: ["Consent ID: ", consentId] }) : null, _jsx("button", { className: "btn", onClick: () => navigate('/banks/preview'), children: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F" })] }) }));
};
