import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIdForm } from '../components/UserIdForm';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
export const UserIdPage = () => {
    const { userId, userName, setInitialUserData } = useUser();
    const { notifySuccess, notifyError } = useNotifications();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleSubmit = async (nextId, nextName) => {
        try {
            setIsSubmitting(true);
            setInitialUserData(nextId.toLowerCase(), nextName);
            notifySuccess('ID и имя сохранены');
            navigate('/banks');
        }
        catch (error) {
            console.error(error);
            notifyError('Не удалось сохранить данные');
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (_jsx("div", { className: "app-main", children: _jsx(UserIdForm, { defaultUserId: userId, defaultUserName: userName, onSubmit: handleSubmit, isSubmitting: isSubmitting }) }));
};
