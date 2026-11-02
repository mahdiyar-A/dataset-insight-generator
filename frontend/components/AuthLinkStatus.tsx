'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { readAuthLinkOutcome } from '@/lib/authLinks';

/**
 * The landing page for a Supabase email link: sign-up verification and email
 * change both use it. Shows the real outcome — including Supabase's own reason
 * when a link has expired — instead of a generic failure after a delay.
 */

interface Props {
  successTitle: string;
  successMessage: string;
  redirectTo: string;
  redirectLabel: string;
}

const LINK_TIMEOUT_MS = 8000;

export default function AuthLinkStatus({ successTitle, successMessage, redirectTo, redirectLabel }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'info' | 'error'>('loading');
  const [message, setMessage] = useState('Checking your link...');
  const settled = useRef(false);

  useEffect(() => {
    const finish = (next: 'success' | 'info' | 'error', text: string) => {
      if (settled.current) return;
      settled.current = true;
      setStatus(next);
      setMessage(text);
      if (next === 'success') setTimeout(() => router.push(redirectTo), 2500);
    };

    const outcome = readAuthLinkOutcome();
    if (outcome.error) { finish('error', outcome.error); return; }
    // Two-step email change: the first link confirms one address and asks for
    // the other. That is progress, not failure.
    if (outcome.message) { finish('info', outcome.message); return; }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) finish('success', successMessage);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish('success', successMessage);
    });
    const timer = setTimeout(
      () => finish('error', 'This link is invalid or has expired. Please request a new one.'),
      LINK_TIMEOUT_MS);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, [redirectTo, router, successMessage]);

  const icon  = { loading: '⏳', success: '✅', info: '📧', error: '❌' }[status];
  const title = { loading: 'Checking...', success: successTitle, info: 'One more step', error: 'Link not valid' }[status];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '16px' }}>
      <div style={{ background: '#1e293b', padding: '48px', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
        <h2 style={{ color: '#e2e8f0', marginBottom: '12px', fontSize: '1.3rem' }}>{title}</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
        {(status === 'error' || status === 'info') && (
          <button onClick={() => router.push(status === 'error' ? '/login' : redirectTo)}
            style={{ marginTop: '24px', padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            {status === 'error' ? 'Back to login' : redirectLabel}
          </button>
        )}
      </div>
    </div>
  );
}
