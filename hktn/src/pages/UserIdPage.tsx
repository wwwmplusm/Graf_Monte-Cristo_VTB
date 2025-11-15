import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIdForm } from '../components/UserIdForm';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

export const UserIdPage: React.FC = () => {
  const { userId, userName, setInitialUserData } = useUser();
  const { notifySuccess, notifyError } = useNotifications();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (nextId: string, nextName: string) => {
    try {
      setIsSubmitting(true);
      setInitialUserData(nextId.toLowerCase(), nextName);
      notifySuccess('ID и имя сохранены');
      navigate('/banks');
    } catch (error) {
      console.error(error);
      notifyError('Не удалось сохранить данные');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-main">
      <UserIdForm
        defaultUserId={userId}
        defaultUserName={userName}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
