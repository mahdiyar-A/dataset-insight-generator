'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { errorMessage } from "@/lib/types";
import { readAuthLinkOutcome } from '@/lib/authLinks';

// How long to wait for the reset link's session before saying it didn't work.
const LINK_TIMEOUT_MS = 8000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);
  const [ready,     setReady]     = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    // An expired or reused link arrives with the reason in the URL and never
    // produces an auth event — so without this the page waited for ever.
    const outcome = readAuthLinkOutcome();
    if (outcome.error) { setLinkError(outcome.error); return; }

    const markReady = () => { readyRef.current = true; setReady(true); };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) markReady();
    });

    // The client may have processed the link before this listener existed, in
    // which case the event has already fired and only the session remains.
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) markReady(); });

    const timer = setTimeout(() => {
      if (!readyRef.current)
        setLinkError('This reset link is invalid or has expired. Please request a new one.');
    }, LINK_TIMEOUT_MS);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const handleReset = async () => {
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      setError(errorMessage(err) || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: '#e2e8f0' }}>Password Reset!</h2>
        <p style={{ color: '#94a3b8' }}>Redirecting to login...</p>
      </div>
    </div>
  );

  if (linkError) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ color: '#e2e8f0', marginBottom: '12px', fontSize: '1.3rem' }}>Reset link not valid</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>{linkError}</p>
        <button onClick={() => router.push('/forgot-password')}
          style={{ marginTop: '24px', padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          Request a new link
        </button>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <p style={{ color: '#94a3b8' }}>Validating reset link...</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ color: '#e2e8f0', marginBottom: '24px', textAlign: 'center' }}>Set New Password</h2>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>New Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat new password"
            style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
        </div>
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</p>}
        <button onClick={handleReset} disabled={loading}
          style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </div>
    </div>
  );
}