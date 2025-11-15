import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { pollConsent } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
const POLL_INTERVAL_MS = 3500;
export const ConsentStatusPage = () => {
    const { bankId } = useParams();
    const [searchParams] = useSearchParams();
    const requestId = searchParams.get('requestId') || undefined;
    const bankName = searchParams.get('bankName') ?? bankId;
    const navigate = useNavigate();
    const { userId, upsertConsent } = useUser();
    const { notifyError } = useNotifications();
    const [status, setStatus] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const runPoll = useCallback(async () => {
        if (!userId || !bankId || !requestId) {
            return null;
        }
        try {
            setIsPolling(true);
            const payload = await pollConsent({ user_id: userId, bank_id: bankId, request_id: requestId });
            setStatus(payload);
            upsertConsent({
                bankId,
                requestId,
                consentId: payload.consent_id,
                status: payload.state,
                approvalUrl: payload.approval_url,
            });
            return payload;
        }
        catch (error) {
            console.error(error);
            notifyError('Не удалось обновить статус');
            return null;
        }
        finally {
            setIsPolling(false);
        }
    }, [bankId, bankName, notifyError, requestId, upsertConsent, userId]);
    useEffect(() => {
        if (!userId || !bankId || !requestId)
            return;
        let timer;
        let cancelled = false;
        const schedule = () => {
            timer = window.setTimeout(async () => {
                if (cancelled)
                    return;
                const payload = await runPoll();
                if (!cancelled && payload?.state !== 'approved') {
                    schedule();
                }
            }, POLL_INTERVAL_MS);
        };
        runPoll().then((payload) => {
            if (!cancelled && payload?.state !== 'approved') {
                schedule();
            }
        });
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [bankId, requestId, runPoll, userId]);
    const canContinue = status?.state === 'approved';
    if (!bankId || !requestId) {
        return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("p", { children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430. \u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u043A \u0441\u043F\u0438\u0441\u043A\u0443 \u0431\u0430\u043D\u043A\u043E\u0432." }), _jsx("button", { className: "btn-secondary btn", onClick: () => navigate('/banks'), children: "\u041D\u0430\u0437\u0430\u0434 \u043A \u0431\u0430\u043D\u043A\u0430\u043C" })] }) }));
    }
    return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsxs("h2", { children: ["\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0432 ", bankName] }), _jsxs("p", { children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", status?.state ?? 'ожидание'] }), _jsxs("p", { children: ["\u041E\u0442\u0432\u0435\u0442 \u0431\u0430\u043D\u043A\u0430: ", status?.status ?? '...', " "] }), status?.approval_url ? (_jsxs("p", { children: ["\u0421\u0441\u044B\u043B\u043A\u0430: ", _jsx("a", { href: status.approval_url, children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0440\u0442\u0430\u043B \u0431\u0430\u043D\u043A\u0430" })] })) : null, _jsxs("div", { style: { display: 'flex', gap: 12, marginTop: 16 }, children: [_jsx("button", { className: "btn", onClick: runPoll, disabled: isPolling, children: "\u042F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B" }), _jsx("button", { className: "btn-secondary btn", onClick: () => navigate('/banks'), children: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0439 \u0431\u0430\u043D\u043A" })] }), canContinue ? (_jsx("button", { className: "btn", style: { marginTop: 16 }, onClick: () => navigate('/banks/preview'), children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0430\u043C" })) : null] }) }));
};
