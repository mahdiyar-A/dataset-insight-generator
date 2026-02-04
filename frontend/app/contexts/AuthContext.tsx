'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import BackendAPI from '@/lib/BackendAPI';

interface User {
  id: string;
  email: string;
  username: string;
  profilePicture: string | null;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;

}

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, username: string) => Promise<User>;
  logout: () => void;
  updateUser: (user: User) => void; // <--- new helper
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      const user = await BackendAPI.getCurrentUser();
      setCurrentUser(user);
      setIsLoading(false);
    };
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const user = await BackendAPI.login(email, password);
    setCurrentUser(user);
    return user;
  };

  const register = async (email: string, password: string, username: string) => {
    const user = await BackendAPI.register(email, password, username);
    setCurrentUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    setCurrentUser(null);
  };

  // New: updateUser keeps context and localStorage in sync
  const updateUser = (user: User) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (err) {
      // ignore storage errors in mock
      console.warn('Failed to write currentUser to localStorage', err);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}