import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBanks } from '../api/client';
const STORAGE_KEY = 'finpulse:userId';
const USER_NAME_KEY = 'finpulse:userName';
const UserContext = createContext(undefined);
export const UserProvider = ({ children }) => {
    const [userId, setUserIdState] = useState(() => localStorage.getItem(STORAGE_KEY));
    const [userName, setUserNameState] = useState(() => localStorage.getItem(USER_NAME_KEY));
    const [banks, setBanks] = useState([]);
    const [isFetchingBanks, setIsFetchingBanks] = useState(false);
    const setInitialUserData = useCallback((nextId, nextName) => {
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
        banks,
        refreshBanks,
        isFetchingBanks,
    }), [banks, clearUser, isFetchingBanks, refreshBanks, setInitialUserData, userId, userName]);
    return _jsx(UserContext.Provider, { value: value, children: children });
};
export const useUser = () => {
    const ctx = useContext(UserContext);
    if (!ctx) {
        throw new Error('useUser must be used inside UserProvider');
    }
    return ctx;
};
