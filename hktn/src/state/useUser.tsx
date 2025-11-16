import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBanks } from '../api/client';

export type BankSummary = {
  id: string;
  name: string;
  connected: boolean;
  baseUrl?: string | null;
  status?: string;
  error?: string;
};

type UserContextValue = {
  userId: string | null;
  userName: string | null;
  setInitialUserData: (nextId: string, nextName: string) => void;
  clearUser: () => void;
  banks: BankSummary[];
  refreshBanks: () => Promise<void>;
  isFetchingBanks: boolean;
};

const STORAGE_KEY = 'finpulse:userId';
const USER_NAME_KEY = 'finpulse:userName';

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [userId, setUserIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [userName, setUserNameState] = useState<string | null>(() => localStorage.getItem(USER_NAME_KEY));
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);

  const setInitialUserData = useCallback((nextId: string, nextName: string) => {
    localStorage.setItem(STORAGE_KEY, nextId);
    localStorage.setItem(USER_NAME_KEY, nextName);
    setUserIdState(nextId);
    setUserNameState(nextName);
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    setUserIdState(null);
    setUserNameState(null);
    setBanks([]);
  }, []);

  const refreshBanks = useCallback(async () => {
    if (!userId) {
      setBanks([]);
      return;
    }
    try {
      setIsFetchingBanks(true);
      const response = await getBanks(userId);
      setBanks(response.banks ?? []);
    } catch (error) {
      console.error('Failed to fetch banks', error);
    } finally {
      setIsFetchingBanks(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      refreshBanks();
    }
  }, [userId, refreshBanks]);

  const value = useMemo<UserContextValue>(
    () => ({
      userId,
      userName,
      setInitialUserData,
      clearUser,
      banks,
      refreshBanks,
      isFetchingBanks,
    }),
    [banks, clearUser, isFetchingBanks, refreshBanks, setInitialUserData, userId, userName]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used inside UserProvider');
  }
  return ctx;
};
