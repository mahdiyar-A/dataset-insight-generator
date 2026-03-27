'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import BackendAPI from '@/lib/BackendAPI';

type User = {
  id?: string;
  email?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePicture?: string;
  createdAt?: string;
  isActive?: boolean;
};

type AuthContextType = {
  user: User | null;
  currentUser: User | null;
  token: string | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  refreshUser: () => Promise<void>;  // re-fetches from backend — call after any update
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY   = 'dig_token';
const USER_KEY    = 'dig_user';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function clearAllSessionState() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('dig_report_ready');
  sessionStorage.clear();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,     setToken]     = useState<string | null>(null);
  const [user,      setUser]      = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage — check token expiry
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser  = localStorage.getItem(USER_KEY);
      if (savedToken && !isTokenExpired(savedToken)) {
        setToken(savedToken);
        if (savedUser) setUser(JSON.parse(savedUser));
      } else if (savedToken) {
        // Token expired — clear everything
        clearAllSessionState();
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, []);

  // Re-fetch full profile from backend and update state + localStorage
  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    try {
      const profile = await BackendAPI.getUserProfile(t);
      const merged = normalizeUser(profile);
      setUser(merged);
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
    } catch { /* token expired or network error */ }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await BackendAPI.login(email, password);
    const t = data?.token;
    const u = data?.user;
    if (!t || !u) throw new Error('Login response missing token/user');

    setToken(t);
    localStorage.setItem(TOKEN_KEY, t);

    // Immediately fetch full profile (firstName, lastName, etc.)
    let fullUser = normalizeUser(u);
    try {
      const profile = await BackendAPI.getUserProfile(t);
      fullUser = normalizeUser({ ...u, ...profile });
    } catch { /* use minimal login data */ }

    setUser(fullUser);
    localStorage.setItem(USER_KEY, JSON.stringify(fullUser));
  };

  const register = async (firstName: string, lastName: string, email: string, password: string) => {
    await BackendAPI.register(firstName, lastName, email, password);
    await login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearAllSessionState();
  };

  // Optimistically update local state, then refresh from backend
  const updateUser = useCallback((partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const merged = { ...prev, ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const value = useMemo(() => ({
    user,
    currentUser: user,
    token,
    isAuthed: !!token,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
  }), [user, token, isLoading, updateUser, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// Normalize backend field names — backend returns userName (capital N)
function normalizeUser(u: any): User {
  return {
    id:             u.id             ?? u.userId,
    email:          u.email,
    userName:       u.userName       ?? u.username,
    firstName:      u.firstName,
    lastName:       u.lastName,
    phoneNumber:    u.phoneNumber,
    profilePicture: u.profilePicture ?? u.profilePicturePath,
    createdAt:      u.createdAt,
    isActive:       u.isActive,
  };
}