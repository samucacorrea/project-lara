import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { login as loginRequest, fetchCurrentUser, updateCurrentUser as updateCurrentUserRequest } from '../services/authService';
import { setHttpAuthToken } from '../services/httpClient';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticating: boolean;
  login: (email: string, password: string) => Promise<void>;
  updateProfile: (payload: Partial<User> & { current_password?: string; password?: string }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_STORAGE_KEY = 'project-lara-token';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const persistToken = useCallback((value: string | null) => {
    setToken(value);
    setHttpAuthToken(value);
    if (value) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setIsAuthenticating(false);
      return;
    }

    persistToken(storedToken);
    fetchCurrentUser()
      .then((current) => setUser(current))
      .catch(() => {
        persistToken(null);
        setUser(null);
      })
      .finally(() => setIsAuthenticating(false));
  }, [persistToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await loginRequest({ email, password });
      persistToken(response.token);
      setUser(response.user);
    },
    [persistToken]
  );

  const updateProfile = useCallback(
    async (payload: Partial<User> & { current_password?: string; password?: string }) => {
      const updated = await updateCurrentUserRequest(payload);
      setUser(updated);
      return updated;
    },
    []
  );

  const logout = useCallback(() => {
    persistToken(null);
    setUser(null);
  }, [persistToken]);

  const value = useMemo(
    () => ({ user, token, isAuthenticating, login, updateProfile, logout }),
    [user, token, isAuthenticating, login, updateProfile, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
