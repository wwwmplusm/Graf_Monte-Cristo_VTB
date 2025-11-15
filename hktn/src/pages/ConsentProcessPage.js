import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startConsent, pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
const POLL_INTERVAL_MS = 3000;
export const ConsentProcessPage = () => {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { userId, userName } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const [bankStates, setBankStates] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    useEffect(() => {
        const selectedBanks = state?.selectedBanks;
        if (!selectedBanks || selectedBanks.length === 0) {
            notifyError('Банки не выбраны. Возврат на предыдущий шаг.');
            navigate('/banks');
        }
        else {
            setBankStates(selectedBanks.map((bank) => ({ ...bank, status: 'idle' })));
        }
    }, [state, navigate, notifyError]);
    const updateBankStatus = (index, newStatus) => {
        setBankStates((prev) => prev.map((bank, i) => (i === index ? { ...bank, ...newStatus } : bank)));
    };
    const handleConnect = useCallback(async (index) => {
        const bank = bankStates[index];
        if (!userId)
            return;
        updateBankStatus(index, { status: 'connecting', errorMessage: undefined });
        try {
            const response = await startConsent({ user_id: userId, bank_id: bank.id });
            if (response.auto_approved || response.state === 'approved') {
                notifySuccess(`Банк ${bank.name} успешно подключен!`);
                updateBankStatus(index, { status: 'connected', consentId: response.consent_id });
                setTimeout(() => setCurrentIndex((prev) => prev + 1), 2000);
            }
            else {
                updateBankStatus(index, {
                    status: 'pending_approval',
                    approvalUrl: response.approval_url,
                    requestId: response.request_id,
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
            notifyError(`Ошибка подключения к ${bank.name}`);
            updateBankStatus(index, { status: 'error', errorMessage: message });
        }
    }, [bankStates, userId, notifySuccess, notifyError]);
    const handlePoll = useCallback(async (index) => {
        const bank = bankStates[index];
        if (!userId || !bank.requestId)
            return;
        updateBankStatus(index, { status: 'polling' });
        const poll = async () => {
            try {
                const payload = await pollConsent({ user_id: userId, bank_id: bank.id, request_id: bank.requestId });
                if (payload.state === 'approved') {
                    notifySuccess(`Подтверждение от ${bank.name} получено!`);
                    updateBankStatus(index, { status: 'connected', consentId: payload.consent_id });
                    setTimeout(() => setCurrentIndex((prev) => prev + 1), 2000);
                    return true;
                }
                return false;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Ошибка опроса статуса';
                notifyError(message);
                updateBankStatus(index, { status: 'error', errorMessage: message });
                return true;
            }
        };
        const intervalId = setInterval(async () => {
            const done = await poll();
            if (done) {
                clearInterval(intervalId);
            }
        }, POLL_INTERVAL_MS);
        const done = await poll();
        if (done) {
            clearInterval(intervalId);
        }
    }, [bankStates, notifyError, notifySuccess, userId]);
    const isFinished = currentIndex >= bankStates.length;
    const renderBankCard = (bank, index) => {
        const isCurrent = index === currentIndex;
        return (_jsxs("div", { className: "card", style: { opacity: isCurrent || bank.status !== 'idle' ? 1 : 0.5 }, children: [_jsxs("h3", { children: [index + 1, ". ", bank.name] }), bank.status === 'idle' && isCurrent && (_jsxs(_Fragment, { children: [_jsx("p", { children: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435." }), _jsx("button", { className: "btn", onClick: () => handleConnect(index), children: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C" })] })), bank.status === 'connecting' && _jsx("p", { children: "\u0423\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u043C \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435..." }), bank.status === 'polling' && _jsx("p", { children: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043E\u0442 \u0431\u0430\u043D\u043A\u0430..." }), bank.status === 'pending_approval' && (_jsxs(_Fragment, { children: [_jsx("p", { children: "\uD83D\uDD52 \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0440\u0443\u0447\u043D\u043E\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043F\u043E \u0441\u0441\u044B\u043B\u043A\u0435 \u0432 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435, \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435\u0441\u044C \u0438 \u0434\u0430\u0439\u0442\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435, \u0437\u0430\u0442\u0435\u043C \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0441\u044E\u0434\u0430." }), bank.approvalUrl && (_jsx("a", { href: bank.approvalUrl, target: "_blank", rel: "noopener noreferrer", children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 \u0441\u0430\u0439\u0442 \u0431\u0430\u043D\u043A\u0430" })), _jsx("button", { className: "btn", style: { marginTop: '12px' }, onClick: () => handlePoll(index), children: "\u042F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B \u0432 \u0431\u0430\u043D\u043A\u0435" })] })), bank.status === 'connected' && _jsx("p", { style: { color: '#16a34a' }, children: "\u2705 \u0423\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E!" }), bank.status === 'error' && (_jsxs(_Fragment, { children: [_jsxs("p", { style: { color: '#dc2626' }, children: ["\u274C \u041E\u0448\u0438\u0431\u043A\u0430: ", bank.errorMessage] }), _jsx("button", { className: "btn-secondary btn", onClick: () => handleConnect(index), children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C" })] }))] }, bank.id));
    };
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0428\u0430\u0433 3. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0431\u0430\u043D\u043A\u043E\u0432" }), _jsx("p", { children: userName
                            ? `${userName}, мы последовательно пройдем процесс получения согласия для каждого выбранного банка.`
                            : 'Мы последовательно пройдем процесс получения согласия для каждого выбранного банка.' })] }), bankStates.map(renderBankCard), isFinished && (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0412\u0441\u0435 \u0431\u0430\u043D\u043A\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u044B!" }), _jsx("button", { className: "btn", onClick: () => navigate('/banks/preview'), children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0432\u044B\u0431\u043E\u0440\u0443 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u043E\u0432" })] }))] }));
};
