'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchEnabledProviders, type SocialProvider } from '@/lib/socialAuth';

/**
 * "Continue with Google / Microsoft / GitHub / LinkedIn" buttons.
 *
 * Only providers switched on in Supabase are shown, so nothing appears for a
 * provider that isn't set up yet. Renders nothing at all when none are on,
 * leaving the email form exactly as it was.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHER_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function Logo({ id }: { id: string }) {
  const s = { width: 18, height: 18, flexShrink: 0 } as const;
  switch (id) {
    case 'google':
      return (
        <svg style={s} viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
      );
    case 'azure':
      return (
        <svg style={s} viewBox="0 0 23 23" aria-hidden="true">
          <path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/>
          <path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/>
        </svg>
      );
    case 'github':
      return (
        <svg style={s} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="#e5e7eb" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      );
    case 'linkedin_oidc':
      return (
        <svg style={s} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>
        </svg>
      );
    default:
      return null;
  }
}

export default function SocialSignIn() {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEnabledProviders(SUPABASE_URL, SUPABASE_KEY).then(setProviders);
  }, []);

  if (providers.length === 0) return null;

  const start = async (p: SocialProvider) => {
    setError('');
    setBusy(p.id);
    const next = new URLSearchParams(window.location.search).get('redirectTo') ?? '/dashboard';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p.id,
      options: {
        // A public page that finishes the sign-in, rather than /dashboard
        // directly: the dashboard is gated, and the session is only in the URL
        // until the client has read it.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: p.scopes,
      },
    });
    if (error) {
      setBusy(null);
      setError(`Couldn't start ${p.label} sign-in. Please try again or use email.`);
    }
    // On success the browser is already navigating to the provider.
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
      {providers.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => start(p)}
          disabled={busy !== null}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '11px 14px', borderRadius: '999px',
            border: '1px solid #334155', background: 'rgba(15,23,42,0.6)', color: '#e5e7eb',
            fontSize: '0.92rem', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            opacity: busy && busy !== p.id ? 0.55 : 1, minHeight: '44px',
          }}
        >
          <Logo id={p.id} />
          {busy === p.id ? `Opening ${p.label}…` : `Continue with ${p.label}`}
        </button>
      ))}
      {error && <p className="auth-error" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0 2px', color: '#64748b', fontSize: '0.8rem' }}>
        <span style={{ flex: 1, height: 1, background: '#334155' }} />
        or use email
        <span style={{ flex: 1, height: 1, background: '#334155' }} />
      </div>
    </div>
  );
}
