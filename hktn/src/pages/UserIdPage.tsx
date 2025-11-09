import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIdForm } from '../components/UserIdForm';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

export const UserIdPage: React.FC = () => {
  const { userId, setUserId } = useUser();
  const { notifySuccess, notifyError } = useNotifications();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (nextId: string) => {
    try {
      setIsSubmitting(true);
      setUserId(nextId.toLowerCase());
      notifySuccess('ID сохранён');
      navigate('/banks');
    } catch (error) {
      console.error(error);
      notifyError('Не удалось сохранить ID');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-main">
      <UserIdForm defaultValue={userId} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </div>
  );
};
