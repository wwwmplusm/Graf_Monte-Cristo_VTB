import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commitOnboarding, runIngestion } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
export const IngestionPage = () => {
    const { userId } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const navigate = useNavigate();
    const [ingesting, setIngesting] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [statuses, setStatuses] = useState([]);
    const [ingestDone, setIngestDone] = useState(false);
    const [commitDone, setCommitDone] = useState(false);
    const handleIngest = async () => {
        if (!userId)
            return;
        try {
            setIngesting(true);
            const response = await runIngestion({ user_id: userId });
            setStatuses(response.bank_statuses ?? []);
            setIngestDone(true);
            notifySuccess('Загрузка транзакций завершена');
        }
        catch (error) {
            console.error(error);
            notifyError('Ошибка при загрузке транзакций');
        }
        finally {
            setIngesting(false);
        }
    };
    const handleCommit = async () => {
        if (!userId)
            return;
        try {
            setCommitting(true);
            await commitOnboarding({ user_id: userId });
            setCommitDone(true);
            notifySuccess('Онбординг завершён');
        }
        catch (error) {
            console.error(error);
            notifyError('Не удалось завершить онбординг');
        }
        finally {
            setCommitting(false);
        }
    };
    return (_jsx("div", { className: "app-main", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0428\u0430\u0433 8. \u0418\u043D\u0436\u0435\u0441\u0442 \u0438 \u043A\u043E\u043C\u043C\u0438\u0442" }), _jsx("p", { children: "\u0421\u043E\u0431\u0438\u0440\u0430\u0435\u043C \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0438 \u0441\u043E \u0432\u0441\u0435\u0445 \u0431\u0430\u043D\u043A\u043E\u0432 \u0438 \u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0435\u043C \u0441\u0435\u0441\u0441\u0438\u044E." }), _jsx("button", { className: "btn", onClick: handleIngest, disabled: ingesting || ingestDone, children: ingestDone ? 'Готово' : 'Загрузить данные' }), statuses.length ? (_jsx("ul", { className: "list", children: statuses.map((status) => (_jsxs("li", { children: [status.bank_name, ": ", status.status, " \u2014 ", status.message] }, status.bank_name))) })) : null, ingestDone ? (_jsx("button", { className: "btn", onClick: handleCommit, disabled: committing || commitDone, children: commitDone ? 'Сохранено' : 'Commit onboarding' })) : null, commitDone ? (_jsx("button", { className: "btn", style: { marginTop: 12 }, onClick: () => navigate('/dashboard'), children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0435" })) : null] }) }));
};
