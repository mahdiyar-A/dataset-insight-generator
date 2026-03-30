'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

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
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
        <h2 style={{ color: '#e2e8f0', marginBottom: '12px' }}>Check your email</h2>
        <p style={{ color: '#94a3b8', lineHeight: 1.7 }}>
          We sent a password reset link to <strong style={{ color: '#e2e8f0' }}>{email}</strong>.
        </p>
        <button onClick={() => router.push('/login')}
          style={{ marginTop: '24px', padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          Back to Login
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '400px' }}>
        <button onClick={() => router.push('/login')}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '16px', padding: '0' }}>
          ← Back to Login
        </button>
        <h2 style={{ color: '#e2e8f0', marginBottom: '8px' }}>Forgot Password</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '24px' }}>
          Enter your email and we'll send you a reset link.
        </p>
        <input type="email" placeholder="Your email address" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '12px' }} />
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </div>
    </div>
  );
}