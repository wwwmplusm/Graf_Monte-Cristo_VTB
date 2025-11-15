import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from './state/notifications';
import { useUser } from './state/useUser';
import { BanksCatalogPage } from './pages/BanksCatalogPage';
import { CallbackPage } from './pages/CallbackPage';
import { ConsentStatusPage } from './pages/ConsentStatusPage';
import { DashboardPage } from './pages/DashboardPage';
import { DebtGoalPage } from './pages/DebtGoalPage';
import { GoalsLandingPage } from './pages/GoalsLandingPage';
import { IngestionPage } from './pages/IngestionPage';
import { PreviewPage } from './pages/PreviewPage';
import { SaveGoalPage } from './pages/SaveGoalPage';
import { UserIdPage } from './pages/UserIdPage';
import { ConsentProcessPage } from './pages/ConsentProcessPage';
const ProtectedRoute = () => {
    const { userId } = useUser();
    const location = useLocation();
    if (!userId) {
        return _jsx(Navigate, { to: "/", replace: true, state: { from: location } });
    }
    return _jsx(Outlet, {});
};
class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, message: error.message };
    }
    componentDidCatch(error, errorInfo) {
        console.error('App crashed', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A" }), _jsx("p", { children: this.state.message }), _jsx("button", { className: "btn", onClick: () => this.setState({ hasError: false }), children: "\u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430" })] }) }));
        }
        return this.props.children;
    }
}
const Header = () => {
    const { userId, clearUser } = useUser();
    const navigate = useNavigate();
    const { notify } = useNotifications();
    return (_jsxs("header", { style: { padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("strong", { children: "FinPulse MPA" }), userId ? _jsxs("span", { style: { marginLeft: 12, color: '#475569' }, children: ["User: ", userId] }) : null] }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsx("button", { className: "btn-secondary btn", onClick: () => navigate('/dashboard'), children: "\u0414\u0430\u0448\u0431\u043E\u0440\u0434" }), userId ? (_jsx("button", { className: "btn-secondary btn", onClick: () => {
                            clearUser();
                            notify('Сессия очищена');
                            navigate('/');
                        }, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C" })) : null] })] }));
};
export const App = () => (_jsx(AppErrorBoundary, { children: _jsxs("div", { className: "app-shell", children: [_jsx(Header, {}), _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(UserIdPage, {}) }), _jsxs(Route, { element: _jsx(ProtectedRoute, {}), children: [_jsx(Route, { path: "/banks", element: _jsx(BanksCatalogPage, {}) }), _jsx(Route, { path: "/banks/:bankId/status", element: _jsx(ConsentStatusPage, {}) }), _jsx(Route, { path: "/banks/preview", element: _jsx(PreviewPage, {}) }), _jsx(Route, { path: "/onboarding/consent", element: _jsx(ConsentProcessPage, {}) }), _jsx(Route, { path: "/goals", element: _jsx(GoalsLandingPage, {}) }), _jsx(Route, { path: "/goals/save", element: _jsx(SaveGoalPage, {}) }), _jsx(Route, { path: "/goals/debts", element: _jsx(DebtGoalPage, {}) }), _jsx(Route, { path: "/ingest", element: _jsx(IngestionPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(DashboardPage, {}) })] }), _jsx(Route, { path: "/callback", element: _jsx(CallbackPage, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] })] }) }));
export default App;
