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

// ── Terminal-style logger ─────────────────────────────────────────────────────
const log  = (tag: string, msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (data !== undefined) {
    console.log(`[${ts}] [Auth:${tag}] ${msg}`, data);
  } else {
    console.log(`[${ts}] [Auth:${tag}] ${msg}`);
  }
};
const warn = (tag: string, msg: string, data?: unknown) =>
  console.warn(`[Auth:${tag}] ⚠ ${msg}`, ...(data !== undefined ? [data] : []));
const err  = (tag: string, msg: string, data?: unknown) =>
  console.error(`[Auth:${tag}] ✗ ${msg}`, ...(data !== undefined ? [data] : []));

// ── Helper: sync user to public.users via backend ────────────────────────────
async function syncUser(token: string, firstName: string, lastName: string, email: string): Promise<void> {
  if (!token || token === 'null' || token === 'undefined') {
    warn('Sync', 'Skipping sync — token is empty');
    return;
  }
  log('Sync', `POST ${API_BASE}/api/auth/sync-supabase-user`, { email });
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
    if (res.ok) {
      log('Sync', `✓ ${res.status} — ${text}`);
    } else {
      warn('Sync', `✗ ${res.status} — ${text}`);
    }
  } catch (e) {
    err('Sync', 'Network error', e);
  }
}

// ── Helper: fetch full profile from backend with retry ───────────────────────
async function fetchProfile(token: string, retries = 5, delayMs = 800): Promise<Profile | null> {
  if (!token || token === 'null' || token === 'undefined') {
    warn('Profile', 'Skipping fetch — token is empty');
    return null;
  }

  log('Profile', `GET ${API_BASE}/api/user/me (up to ${retries} attempts)`);

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        warn('Profile', `Not synced yet (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms...`);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delayMs));
          delayMs = Math.min(delayMs * 1.5, 3000);
          continue;
        }
        warn('Profile', 'All retry attempts exhausted — user not synced');
        return null;
      }

      if (!res.ok) {
        err('Profile', `Unexpected status ${res.status}`);
        return null;
      }

      const data = await res.json();
      log('Profile', `✓ Loaded profile for ${data.email}`);
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
    } catch (e) {
      err('Profile', 'Network error', e);
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

  // ── Listen to Supabase auth state changes ────────────────────────────
  useEffect(() => {
    log('Init', 'Checking existing session...');
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        warn('Init', 'Session found but email not confirmed — signing out');
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (session) {
        log('Init', `✓ Existing session found — user: ${session.user?.email}`);
      } else {
        log('Init', 'No existing session');
      }

      setSession(session);
      if (session?.access_token) {
        const profile = await fetchProfile(session.access_token);
        if (profile) setUser(profile);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      log('StateChange', `Event: ${event}`, { email: session?.user?.email });

      if (session?.user && !session.user.email_confirmed_at) {
        warn('StateChange', 'Email not confirmed — signing out');
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        return;
      }

      setSession(session);

      if (session?.access_token) {
        if (event === 'SIGNED_IN') {
          log('StateChange', 'SIGNED_IN — running user sync...');
          const u = session.user;
          const firstName = u.user_metadata?.first_name ?? u.email?.split('@')[0] ?? 'User';
          const lastName  = u.user_metadata?.last_name  ?? '';
          const email     = u.email ?? '';
          await syncUser(session.access_token, firstName, lastName, email);
        }

        const profile = await fetchProfile(session.access_token);
        if (profile) {
          setUser(profile);
          log('StateChange', `✓ Profile set for ${profile.email}`);
        }
      } else {
        log('StateChange', 'No session — clearing user state');
        setUser(null);
      }
    });

    return () => {
      log('Init', 'Unsubscribing from auth state changes');
      subscription.unsubscribe();
    };
  }, []);

  // ── Register ──────────────────────────────────────────────────────────
  const register = useCallback(async (
    firstName: string, lastName: string, email: string, password: string
  ): Promise<{ needsVerification: boolean }> => {
    log('Register', `Registering new user: ${email}`);
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

    if (error) {
      err('Register', error.message);
      throw new Error(error.message);
    }

    if (data.session?.access_token) {
      log('Register', 'Session issued immediately — syncing user');
      await syncUser(data.session.access_token, firstName, lastName, email);
    } else {
      log('Register', 'Email verification required — no immediate session');
    }

    const needsVerification = !data.session;
    log('Register', `✓ Registration complete — needsVerification: ${needsVerification}`);
    return { needsVerification };
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    log('Login', `Attempting login for: ${email}`);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      err('Login', error.message);
      throw new Error(error.message);
    }

    if (!data.user?.email_confirmed_at) {
      warn('Login', 'Email not confirmed — rejecting session');
      await supabase.auth.signOut();
      throw new Error('Please verify your email before logging in. Check your inbox.');
    }

    log('Login', `✓ Login successful — user: ${data.user?.email}`);
    // onAuthStateChange fires SIGNED_IN and handles sync + profile fetch
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    log('Logout', 'Signing out...');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    log('Logout', '✓ Signed out');
  }, []);

  // ── Refresh profile from backend ──────────────────────────────────────
  const refreshUser = useCallback(async () => {
    if (!token) {
      warn('Refresh', 'No token — skipping refresh');
      return;
    }
    log('Refresh', 'Refreshing profile from backend...');
    const profile = await fetchProfile(token);
    if (profile) {
      setUser(profile);
      log('Refresh', `✓ Profile refreshed for ${profile.email}`);
    }
  }, [token]);

  // ── Optimistic update ─────────────────────────────────────────────────
  const updateUser = useCallback((partial: Partial<Profile>) => {
    log('Update', 'Optimistic profile update', Object.keys(partial));
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  // ── Reset password ────────────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    log('ResetPw', `Sending reset email to ${email}`);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      err('ResetPw', error.message);
      throw new Error(error.message);
    }
    log('ResetPw', '✓ Reset email sent');
  }, []);

  // ── Update email ──────────────────────────────────────────────────────
  const updateEmail = useCallback(async (newEmail: string) => {
    log('UpdateEmail', `Updating email to ${newEmail}`);
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/verify-email-change` }
    );
    if (error) {
      err('UpdateEmail', error.message);
      throw new Error(error.message);
    }
    log('UpdateEmail', '✓ Confirmation email sent');
  }, []);

  // ── Update phone ──────────────────────────────────────────────────────
  const updatePhone = useCallback(async (phone: string) => {
    log('UpdatePhone', `Updating phone to ${phone}`);
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) {
      err('UpdatePhone', error.message);
      throw new Error(error.message);
    }
    log('UpdatePhone', '✓ Phone updated');
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
