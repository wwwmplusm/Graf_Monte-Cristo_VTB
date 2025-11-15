import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startConsent, startProductConsent, pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
const POLL_INTERVAL_MS = 3000;
export const ConsentProcessPage = () => {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { userId } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const [bankStates, setBankStates] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    useEffect(() => {
        const selectedBanks = state?.selectedBanks;
        if (!selectedBanks || selectedBanks.length === 0) {
            navigate('/banks');
        }
        else {
            setBankStates(selectedBanks.map((bank) => ({
                ...bank,
                accountsStatus: 'idle',
                productsStatus: 'idle',
                activeStepData: {},
            })));
        }
    }, [state, navigate]);
    const updateBankStatus = (index, newState) => {
        setBankStates((prev) => prev.map((bank, i) => (i === index ? { ...bank, ...newState } : bank)));
    };
    const finishBank = useCallback(() => {
        setTimeout(() => setCurrentIndex((prev) => prev + 1), 1200);
    }, []);
    const requestConsent = useCallback(async (index, step) => {
        const bank = bankStates[index];
        if (!bank || !userId) {
            return;
        }
        const statusField = step === 'accounts' ? 'accountsStatus' : 'productsStatus';
        updateBankStatus(index, { [statusField]: 'connecting', errorMessage: undefined, activeStepData: {} });
        try {
            const apiCall = step === 'accounts' ? startConsent : startProductConsent;
            const response = await apiCall({ user_id: userId, bank_id: bank.id });
            if (response.auto_approved || response.state === 'approved') {
                notifySuccess(`Доступ к ${step === 'accounts' ? 'счетам/транзакциям' : 'продуктам'} для ${bank.name} получен!`);
                updateBankStatus(index, { [statusField]: 'connected', activeStepData: {} });
                if (step === 'accounts') {
                    void requestConsent(index, 'products');
                }
                else {
                    finishBank();
                }
            }
            else {
                updateBankStatus(index, {
                    [statusField]: 'pending_approval',
                    activeStepData: { approvalUrl: response.approval_url, requestId: response.request_id },
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
            notifyError(`Ошибка доступа к ${step === 'accounts' ? 'счетам' : 'продуктам'} для ${bank.name}`);
            updateBankStatus(index, { [statusField]: 'error', errorMessage: message });
        }
    }, [bankStates, finishBank, notifyError, notifySuccess, userId]);
    const handlePoll = useCallback(async (index, step) => {
        const bank = bankStates[index];
        const requestId = bank?.activeStepData?.requestId;
        if (!bank || !userId || !requestId)
            return;
        const statusField = step === 'accounts' ? 'accountsStatus' : 'productsStatus';
        updateBankStatus(index, { [statusField]: 'polling' });
        const poll = async () => {
            try {
                const payload = await pollConsent({ user_id: userId, bank_id: bank.id, request_id: requestId });
                if (payload.state === 'approved') {
                    notifySuccess(`Подтверждение на ${step === 'accounts' ? 'счета' : 'продукты'} от ${bank.name} получено!`);
                    updateBankStatus(index, { [statusField]: 'connected', activeStepData: {} });
                    if (step === 'accounts') {
                        void requestConsent(index, 'products');
                    }
                    else {
                        finishBank();
                    }
                    return true;
                }
                return false;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Ошибка опроса статуса';
                notifyError(message);
                updateBankStatus(index, { [statusField]: 'error', errorMessage: message });
                return true;
            }
        };
        const intervalId = setInterval(async () => {
            if (await poll()) {
                clearInterval(intervalId);
            }
        }, POLL_INTERVAL_MS);
        if (await poll()) {
            clearInterval(intervalId);
        }
    }, [bankStates, finishBank, notifyError, notifySuccess, requestConsent, userId]);
    useEffect(() => {
        if (bankStates.length === 0) {
            return;
        }
        if (currentIndex < bankStates.length) {
            const bank = bankStates[currentIndex];
            if (bank.accountsStatus === 'idle') {
                void requestConsent(currentIndex, 'accounts');
            }
        }
    }, [bankStates, currentIndex, requestConsent]);
    const retryBank = (index) => {
        const bank = bankStates[index];
        if (!bank)
            return;
        if (bank.accountsStatus !== 'connected') {
            void requestConsent(index, 'accounts');
        }
        else {
            void requestConsent(index, 'products');
        }
    };
    const isFinished = bankStates.length > 0 && currentIndex >= bankStates.length;
    const renderStepStatus = (label, status, bank, step, index) => (_jsxs("div", { style: { padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { children: label }), status === 'idle' && _jsx("span", { style: { color: '#94a3b8' }, children: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435\u2026" }), (status === 'connecting' || status === 'polling') && _jsx("span", { children: "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435 \u23F3" }), status === 'connected' && _jsx("span", { style: { color: '#16a34a', fontWeight: 600 }, children: "\u2705 \u041F\u043E\u043B\u0443\u0447\u0435\u043D" }), status === 'error' && _jsx("span", { style: { color: '#dc2626', fontWeight: 600 }, children: "\u274C \u041E\u0448\u0438\u0431\u043A\u0430" }), status === 'pending_approval' && (_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [bank.activeStepData?.approvalUrl ? (_jsx("a", { className: "btn-secondary btn", href: bank.activeStepData.approvalUrl, target: "_blank", rel: "noreferrer", children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0432 \u0431\u0430\u043D\u043A\u0435" })) : null, _jsx("button", { className: "btn", onClick: () => handlePoll(index, step), children: "\u042F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B" })] }))] }));
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0428\u0430\u0433 3. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0431\u0430\u043D\u043A\u043E\u0432" }), _jsx("p", { children: "\u0414\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0431\u0430\u043D\u043A\u0430 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u043C \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u0441\u0447\u0435\u0442\u0430\u043C \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0430\u043C\u0438." })] }), bankStates.map((bank, index) => (_jsxs("div", { className: "card", style: { opacity: index === currentIndex ? 1 : 0.6 }, children: [_jsxs("h3", { children: [index + 1, ". ", bank.name] }), renderStepStatus('1. Доступ к счетам и транзакциям', bank.accountsStatus, bank, 'accounts', index), bank.accountsStatus === 'connected' &&
                        renderStepStatus('2. Доступ к продуктам (кредиты/вклады/карты)', bank.productsStatus, bank, 'products', index), (bank.accountsStatus === 'error' || bank.productsStatus === 'error') && (_jsx("button", { className: "btn-secondary btn", style: { marginTop: 12 }, onClick: () => retryBank(index), children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C" }))] }, bank.id))), isFinished && (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0412\u0441\u0435 \u0431\u0430\u043D\u043A\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u044B!" }), _jsx("p", { children: "\u0414\u043E\u0441\u0442\u0443\u043F\u044B \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u044B, \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0438\u0442\u044C \u043A \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0435." }), _jsx("button", { className: "btn", onClick: () => navigate('/dashboard'), children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0435" })] }))] }));
};
