'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function VerifyEmailPage() {
  const router  = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setStatus('success');
        setMessage('Email verified! Redirecting to dashboard...');
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus('success');
        setMessage('Email verified! Redirecting to dashboard...');
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        setTimeout(() => {
          setStatus('error');
          setMessage('Verification failed or link expired. Please try again.');
        }, 5000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {status === 'loading' ? '⏳' : status === 'success' ? '✅' : '❌'}
        </div>
        <h2 style={{ color: '#e2e8f0', marginBottom: '12px', fontSize: '1.3rem' }}>
          {status === 'loading' ? 'Verifying...' : status === 'success' ? 'Email Verified!' : 'Verification Failed'}
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
        {status === 'error' && (
          <button onClick={() => router.push('/login')}
            style={{ marginTop: '24px', padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
}