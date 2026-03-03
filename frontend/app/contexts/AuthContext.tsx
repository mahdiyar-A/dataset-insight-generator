'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import BackendAPI from '@/lib/BackendAPI';

type User = {
  id?: string;
  email?: string;
  userName?: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isAuthed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'dig_token';
const USER_KEY = 'dig_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Load saved auth on first mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedToken) setToken(savedToken);
      if (savedUser) setUser(JSON.parse(savedUser));
    } catch {
      // ignore
    }
  }, []);

  const isAuthed = !!token;

  const login = async (email: string, password: string) => {
    const data = await BackendAPI.login(email, password);
    const t = data?.token;
    const u = data?.user;

    if (!t || !u) throw new Error('Login response missing token/user');

    setToken(t);
    setUser(u);

    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  };

  const register = async (firstName: string, lastName: string, email: string, password: string) => {
    // backend register returns { user } (no token), so we auto-login after registering
    await BackendAPI.register(firstName, lastName, email, password);
    await login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const value = useMemo(
    () => ({ user, token, isAuthed, login, register, logout }),
    [user, token, isAuthed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}