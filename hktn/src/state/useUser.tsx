import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBanks } from '../api/client';

export type ConsentState = {
  bankId: string;
  requestId?: string;
  consentId?: string;
  status?: string;
  approvalUrl?: string;
  lastUpdated: number;
};

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
  consents: ConsentState[];
  upsertConsent: (consent: Omit<ConsentState, 'lastUpdated'>) => void;
  banks: BankSummary[];
  refreshBanks: () => Promise<void>;
  isFetchingBanks: boolean;
};

const STORAGE_KEY = 'finpulse:userId';
const USER_NAME_KEY = 'finpulse:userName';
const CONSENTS_KEY = 'finpulse:consents';

const UserContext = createContext<UserContextValue | undefined>(undefined);

const parseStoredConsents = (): ConsentState[] => {
  try {
    const serialized = localStorage.getItem(CONSENTS_KEY);
    if (!serialized) {
      return [];
    }
    const raw = JSON.parse(serialized);
    if (Array.isArray(raw)) {
      return raw.filter(
        (item) => item && typeof item.bankId === 'string'
      ) as ConsentState[];
    }
    return [];
  } catch {
    return [];
  }
};

export const UserProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [userId, setUserIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [userName, setUserNameState] = useState<string | null>(() => localStorage.getItem(USER_NAME_KEY));
  const [consents, setConsents] = useState<ConsentState[]>(parseStoredConsents);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);

  const setInitialUserData = useCallback((nextId: string, nextName: string) => {
    localStorage.setItem(STORAGE_KEY, nextId);
    setUserIdState(nextId);
    localStorage.setItem(USER_NAME_KEY, nextName);
    setUserNameState(nextName);
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(CONSENTS_KEY);
    setUserIdState(null);
    setUserNameState(null);
    setConsents([]);
    setBanks([]);
  }, []);

  const upsertConsent = useCallback(
    (update: Omit<ConsentState, 'lastUpdated'>) => {
      setConsents((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.bankId === update.bankId);
        const payload = {
          ...(index >= 0 ? next[index] : {}),
          ...update,
          lastUpdated: Date.now(),
        };
        if (index >= 0) {
          next[index] = payload as ConsentState;
        } else {
          next.push(payload as ConsentState);
        }
        localStorage.setItem(CONSENTS_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

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
      consents,
      upsertConsent,
      banks,
      refreshBanks,
      isFetchingBanks,
    }),
    [banks, clearUser, consents, isFetchingBanks, refreshBanks, upsertConsent, setInitialUserData, userId, userName]
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
