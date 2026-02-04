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
    const token = localStorage.getItem('authToken');
    if (!token) {
      setCurrentUser(null);
      setIsLoading(false);
      return;
    }
    const loadUser = async () => {
      try {
        const user = await BackendAPI.getCurrentUser(token);
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      }
      setIsLoading(false);
    };
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await BackendAPI.login(email, password);
    // Expect result: { token, user }
    localStorage.setItem('authToken', result.token);
    setCurrentUser(result.user);
    localStorage.setItem('currentUser', JSON.stringify(result.user));
    return result.user;
  };

  const register = async (email: string, password: string, username: string) => {
    const result = await BackendAPI.register(email, password, username);
    localStorage.setItem('authToken', result.token);
    setCurrentUser(result.user);
    localStorage.setItem('currentUser', JSON.stringify(result.user));
    return result.user;
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
  };

  // New: updateUser keeps context and localStorage in sync
  const updateUser = (user: User) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (err) {
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