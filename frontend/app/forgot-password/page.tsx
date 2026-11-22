'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { errorMessage } from "@/lib/types";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { resetPassword } = useAuth();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!isValidEmail(email.trim())) return setError('Enter a valid email.');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err) || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)' }}>
      <div style={{ background: 'var(--card)', padding: '48px', borderRadius: '0', border: '1px solid var(--line)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
        <h2 style={{ color: 'var(--ink)', marginBottom: '12px' }}>Check your email</h2>
        <p style={{ color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          We sent a password reset link to <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
        </p>
        <button onClick={() => router.push('/login')}
          style={{ marginTop: '24px', padding: '10px 24px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 600 }}>
          Back to Login
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)' }}>
      <div style={{ background: 'var(--card)', padding: '48px', borderRadius: '0', border: '1px solid var(--line)', width: '100%', maxWidth: '400px' }}>
        <button onClick={() => router.push('/login')}
          style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '16px', padding: '0' }}>
          ← Back to Login
        </button>
        <h2 style={{ color: 'var(--ink)', marginBottom: '8px' }}>Forgot Password</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginBottom: '24px' }}>
          Enter your email and we'll send you a reset link.
        </p>
        <input type="email" placeholder="Your email address" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '0', color: 'var(--ink)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '12px' }} />
        {error && <p style={{ color: 'var(--danger-text)', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', padding: '12px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: '0', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </div>
    </div>
  );
}