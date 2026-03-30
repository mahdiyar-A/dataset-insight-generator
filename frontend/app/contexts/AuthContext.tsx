'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────
type Profile = {
  id?: string;
  email?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePicture?: string;
  createdAt?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
};

type AuthContextType = {
  user:            Profile | null;
  currentUser:     Profile | null;
  token:           string | null;
  isAuthed:        boolean;
  isLoading:       boolean;
  login:           (email: string, password: string) => Promise<void>;
  register:        (firstName: string, lastName: string, email: string, password: string) => Promise<{ needsVerification: boolean }>;
  logout:          () => Promise<void>;
  updateUser:      (partial: Partial<Profile>) => void;
  refreshUser:     () => Promise<void>;
  resetPassword:   (email: string) => Promise<void>;
  updateEmail:     (newEmail: string) => Promise<void>;
  updatePhone:     (phone: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5150').replace(/\/$/, '');

// ── Helper: sync user to public.users via backend ────────────────────────────
async function syncUser(token: string, firstName: string, lastName: string, email: string): Promise<void> {
  if (!token || token === 'null' || token === 'undefined') return;
  try {
    const res = await fetch(`${API_BASE}/api/auth/sync-supabase-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ firstName, lastName, email }),
    });
    const text = await res.text();
    console.log('[Sync] status:', res.status, text);
  } catch (err) {
    console.error('[Sync] failed:', err);
  }
}

// ── Helper: fetch full profile from backend with retry ───────────────────────
async function fetchProfile(token: string, retries = 5, delayMs = 800): Promise<Profile | null> {
  // Guard: never send a request with a null/empty/literal-"null" token — causes malformed JWT errors
  if (!token || token === 'null' || token === 'undefined') return null;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        console.warn(`[Profile] Not found (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms...`);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delayMs));
          delayMs = Math.min(delayMs * 1.5, 3000); // back off gently
          continue;
        }
        return null;
      }

      if (!res.ok) {
        console.error('[Profile] Unexpected status:', res.status);
        return null;
      }

      const data = await res.json();
      return {
        id:              data.id,
        email:           data.email,
        userName:        data.userName,
        firstName:       data.firstName,
        lastName:        data.lastName,
        phoneNumber:     data.phoneNumber,
        profilePicture:  data.profilePicture,
        createdAt:       data.createdAt,
        isActive:        data.isActive,
        isEmailVerified: data.isEmailVerified,
      };
    } catch (err) {
      console.error('[Profile] fetch error:', err);
      return null;
    }
  }
  return null;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [user,      setUser]      = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const token = session?.access_token ?? null;

  // ── Listen to Supabase auth state changes ────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }
      setSession(session);
      if (session?.access_token) {
        const profile = await fetchProfile(session.access_token);
        if (profile) setUser(profile);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && !session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        return;
      }

      setSession(session);

      if (session?.access_token) {
        if (event === 'SIGNED_IN') {
          const u = session.user;
          const firstName = u.user_metadata?.first_name ?? u.email?.split('@')[0] ?? 'User';
          const lastName  = u.user_metadata?.last_name  ?? '';
          const email     = u.email ?? '';

          // Sync first, THEN fetch profile — ensures row exists before we look it up
          await syncUser(session.access_token, firstName, lastName, email);
        }

        const profile = await fetchProfile(session.access_token);
        if (profile) setUser(profile);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async (
    firstName: string, lastName: string, email: string, password: string
  ): Promise<{ needsVerification: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name:  lastName,
          full_name:  `${firstName} ${lastName}`,
        },
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });

    if (error) throw new Error(error.message);

    // Only sync here if Supabase gave us a session immediately (email confirmation disabled)
    // If email confirmation is required, session is null — sync happens on SIGNED_IN after verification
    if (data.session?.access_token) {
      await syncUser(data.session.access_token, firstName, lastName, email);
    }

    return { needsVerification: !data.session };
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    if (!data.user?.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error('Please verify your email before logging in. Check your inbox.');
    }
    // onAuthStateChange fires SIGNED_IN and handles sync + profile fetch
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  // ── Refresh profile from backend ──────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    if (!token) return;
    const profile = await fetchProfile(token);
    if (profile) setUser(profile);
  }, [token]);

  // ── Optimistic update ─────────────────────────────────────────────────────
  const updateUser = useCallback((partial: Partial<Profile>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  // ── Reset password ────────────────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  // ── Update email ──────────────────────────────────────────────────────────
  const updateEmail = useCallback(async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/verify-email-change` }
    );
    if (error) throw new Error(error.message);
  }, []);

  // ── Update phone ──────────────────────────────────────────────────────────
  const updatePhone = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) throw new Error(error.message);
  }, []);

  const value = useMemo(() => ({
    user,
    currentUser: user,
    token,
    isAuthed:    !!session && !!token,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
    resetPassword,
    updateEmail,
    updatePhone,
  }), [user, session, token, isLoading, login, register, logout, updateUser, refreshUser, resetPassword, updateEmail, updatePhone]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}