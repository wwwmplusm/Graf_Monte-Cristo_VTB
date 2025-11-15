import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
const NotificationsContext = createContext(undefined);
export const NotificationsProvider = ({ children }) => {
    const [items, setItems] = useState([]);
    const dismiss = useCallback((id) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);
    const notify = useCallback((message, type = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setItems((prev) => [...prev, { id, message, type }]);
        window.setTimeout(() => dismiss(id), 5000);
    }, [dismiss]);
    const contextValue = useMemo(() => ({
        notify,
        notifyError: (msg) => notify(msg, 'error'),
        notifySuccess: (msg) => notify(msg, 'success'),
    }), [notify]);
    return (_jsxs(NotificationsContext.Provider, { value: contextValue, children: [children, _jsx("div", { className: "toast-stack", role: "status", "aria-live": "polite", children: items.map((item) => (_jsx("div", { className: `toast toast-${item.type}`, children: item.message }, item.id))) })] }));
};
export const useNotifications = () => {
    const ctx = useContext(NotificationsContext);
    if (!ctx) {
        throw new Error('useNotifications must be used inside NotificationsProvider');
    }
    return ctx;
};
