import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBanks } from '../api/client';
const STORAGE_KEY = 'finpulse:userId';
const USER_NAME_KEY = 'finpulse:userName';
const CONSENTS_KEY = 'finpulse:consents';
const UserContext = createContext(undefined);
const parseStoredConsents = () => {
    try {
        const serialized = localStorage.getItem(CONSENTS_KEY);
        if (!serialized) {
            return [];
        }
        const raw = JSON.parse(serialized);
        if (Array.isArray(raw)) {
            return raw.filter((item) => item && typeof item.bankId === 'string');
        }
        return [];
    }
    catch {
        return [];
    }
};
export const UserProvider = ({ children }) => {
    const [userId, setUserIdState] = useState(() => localStorage.getItem(STORAGE_KEY));
    const [userName, setUserNameState] = useState(() => localStorage.getItem(USER_NAME_KEY));
    const [consents, setConsents] = useState(parseStoredConsents);
    const [banks, setBanks] = useState([]);
    const [isFetchingBanks, setIsFetchingBanks] = useState(false);
    const setInitialUserData = useCallback((nextId, nextName) => {
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
    const upsertConsent = useCallback((update) => {
        setConsents((prev) => {
            const next = [...prev];
            const index = next.findIndex((item) => item.bankId === update.bankId);
            const payload = {
                ...(index >= 0 ? next[index] : {}),
                ...update,
                lastUpdated: Date.now(),
            };
            if (index >= 0) {
                next[index] = payload;
            }
            else {
                next.push(payload);
            }
            localStorage.setItem(CONSENTS_KEY, JSON.stringify(next));
            return next;
        });
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
        }
        catch (error) {
            console.error('Failed to fetch banks', error);
        }
        finally {
            setIsFetchingBanks(false);
        }
    }, [userId]);
    useEffect(() => {
        if (userId) {
            refreshBanks();
        }
    }, [userId, refreshBanks]);
    const value = useMemo(() => ({
        userId,
        userName,
        setInitialUserData,
        clearUser,
        consents,
        upsertConsent,
        banks,
        refreshBanks,
        isFetchingBanks,
    }), [banks, clearUser, consents, isFetchingBanks, refreshBanks, upsertConsent, setInitialUserData, userId, userName]);
    return _jsx(UserContext.Provider, { value: value, children: children });
};
export const useUser = () => {
    const ctx = useContext(UserContext);
    if (!ctx) {
        throw new Error('useUser must be used inside UserProvider');
    }
    return ctx;
};
