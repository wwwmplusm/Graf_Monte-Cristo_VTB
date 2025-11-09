import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Notification = {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
};

type NotificationsContextValue = {
  notify: (message: string, type?: Notification['type']) => void;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export const NotificationsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [items, setItems] = useState<Notification[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, type: Notification['type'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setItems((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({
      notify,
      notifyError: (msg: string) => notify(msg, 'error'),
      notifySuccess: (msg: string) => notify(msg, 'success'),
    }),
    [notify]
  );

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.type}`}>
            {item.message}
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
};

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationsProvider');
  }
  return ctx;
};
