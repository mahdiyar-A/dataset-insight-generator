'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { readAuthLinkOutcome } from '@/lib/authLinks';
import { setAuthMarker } from '@/lib/authCookie';

/**
 * Where Google, Microsoft, GitHub and LinkedIn send people back to.
 *
 * Public on purpose: the session arrives in the URL and the client has to read
 * it before the gated dashboard will let anyone in. Once it has, the sign-in
 * marker is set and the user moves on to where they were going.
 */

const TIMEOUT_MS = 10000;

// Only same-site paths — never bounce someone to another origin from ?next=.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));

    const outcome = readAuthLinkOutcome();
    if (outcome.error) { setError(outcome.error); return; }

    const finish = () => {
      if (done.current) return;
      done.current = true;
      setAuthMarker(true);
      router.replace(next);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) finish();
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) finish(); });

    const timer = setTimeout(() => {
      if (!done.current) setError("We couldn't complete the sign-in. Please try again.");
    }, TIMEOUT_MS);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', padding: '16px' }}>
      <div style={{ background: 'var(--card)', padding: '48px', borderRadius: '0', border: '1px solid var(--line)', textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{error ? '❌' : '⏳'}</div>
        <h2 style={{ color: 'var(--ink)', marginBottom: '12px', fontSize: '1.3rem' }}>
          {error ? 'Sign-in failed' : 'Signing you in…'}
        </h2>
        {error && (
          <>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', lineHeight: 1.6 }}>{error}</p>
            <button onClick={() => router.push('/login')}
              style={{ marginTop: '24px', padding: '10px 24px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 600 }}>
              Back to login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
