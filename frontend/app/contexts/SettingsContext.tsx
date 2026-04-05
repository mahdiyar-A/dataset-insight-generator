// @ts-nocheck
'use client';

/**
 * SettingsContext
 * ──────────────
 * Single source of truth for:
 *   - lang       (en | fr | fa)
 *   - brightness (0–100 slider, >65 = light theme)
 *
 * Backed by sessionStorage ("dig_settings") so:
 *   • Survives client-side navigation (Next.js layout stays mounted)
 *   • Survives visiting sub-pages and coming back
 *   • Clears on tab close (sessionStorage is tab-scoped)
 *   • Clears on Supabase SIGNED_OUT event (explicit logout)
 *
 * Both the landing page and the dashboard read from this context —
 * changing the language in either place immediately affects the other.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { supabase } from '@/lib/supabaseClient';

// ── Types ──────────────────────────────────────────────────────────────────────
export type Lang = 'en' | 'fr' | 'fa';

type SettingsCtx = {
  lang:          Lang;
  brightness:    number;
  setLang:       (l: Lang) => void;
  setBrightness: (b: number) => void;
};

// ── Defaults ───────────────────────────────────────────────────────────────────
const DEFAULT_LANG:       Lang   = 'en';
const DEFAULT_BRIGHTNESS: number = 10;   // dark by default
const STORAGE_KEY = 'dig_settings';

// ── Context ────────────────────────────────────────────────────────────────────
const SettingsContext = createContext<SettingsCtx>({
  lang:          DEFAULT_LANG,
  brightness:    DEFAULT_BRIGHTNESS,
  setLang:       () => {},
  setBrightness: () => {},
});

export function useSettings(): SettingsCtx {
  return useContext(SettingsContext);
}

// ── CSS variable applicator (theme) ────────────────────────────────────────────
function applyTheme(brightness: number) {
  const root = document.documentElement;
  const isLight = brightness > 65;
  const isDark  = brightness < 35;

  if (isLight) {
    root.style.setProperty('--bg',           `hsl(220,20%,${88 + brightness * 0.1}%)`);
    root.style.setProperty('--bg-elevated',  `hsl(220,18%,94%)`);
    root.style.setProperty('--panel',        `rgba(255,255,255,0.9)`);
    root.style.setProperty('--panel2',       `hsl(220,20%,${88 + brightness * 0.1}%)`);
    root.style.setProperty('--text',         '#111827');
    root.style.setProperty('--text-soft',    '#4b5563');
    root.style.setProperty('--border',       '#d1d5db');
    root.style.setProperty('--shadow-soft',  '0 4px 20px rgba(0,0,0,0.08)');
  } else if (isDark) {
    const d = (35 - brightness) / 35;
    root.style.setProperty('--bg',           `hsl(222,${30 + d * 8}%,${3 + brightness * 0.15}%)`);
    root.style.setProperty('--bg-elevated',  `hsl(222,26%,${5 + brightness * 0.2}%)`);
    root.style.setProperty('--panel',        `hsl(220,22%,${8 + brightness * 0.3}%)`);
    root.style.setProperty('--panel2',       `hsl(222,30%,${3 + brightness * 0.15}%)`);
    root.style.setProperty('--text',         '#e5e7eb');
    root.style.setProperty('--text-soft',    '#9ca3af');
    root.style.setProperty('--border',       `hsl(220,20%,${10 + brightness * 0.25}%)`);
    root.style.setProperty('--shadow-soft',  `0 18px 45px rgba(0,0,0,${0.9 - brightness * 0.01})`);
  } else {
    const pct = (brightness - 35) / 30;
    root.style.setProperty('--bg',           `hsl(222,22%,${10 + brightness * 0.35}%)`);
    root.style.setProperty('--bg-elevated',  `hsl(222,18%,${13 + brightness * 0.35}%)`);
    root.style.setProperty('--panel',        `hsl(220,16%,${18 + brightness * 0.45}%)`);
    root.style.setProperty('--panel2',       `hsl(222,22%,${10 + brightness * 0.35}%)`);
    root.style.setProperty('--text',         pct > 0.6 ? '#1f2937' : '#e5e7eb');
    root.style.setProperty('--text-soft',    pct > 0.6 ? '#4b5563' : '#9ca3af');
    root.style.setProperty('--border',       `hsl(220,14%,${22 + brightness * 0.38}%)`);
    root.style.setProperty('--shadow-soft',  '0 10px 32px rgba(0,0,0,0.45)');
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [lang,       _setLang]       = useState<Lang>(DEFAULT_LANG);
  const [brightness, _setBrightness] = useState<number>(DEFAULT_BRIGHTNESS);

  // ── Load from sessionStorage once on mount ────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.lang)                  _setLang(s.lang as Lang);
      if (s.brightness !== undefined) _setBrightness(s.brightness);
    } catch {
      // corrupted storage — ignore, defaults apply
    }
  }, []);

  // ── Apply RTL / LTR whenever lang changes ─────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  }, [lang]);

  // ── Apply CSS variables whenever brightness changes ───────────────────────
  useEffect(() => {
    applyTheme(brightness);
  }, [brightness]);

  // ── Clear on sign-out ─────────────────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(STORAGE_KEY);
        _setLang(DEFAULT_LANG);
        _setBrightness(DEFAULT_BRIGHTNESS);
        console.log('[Settings] Cleared on sign-out');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Persist helper ────────────────────────────────────────────────────────
  const persist = useCallback((patch: Partial<{ lang: Lang; brightness: number }>) => {
    try {
      const cur = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }));
    } catch {}
  }, []);

  // ── Public setters (update state + sessionStorage) ────────────────────────
  const setLang = useCallback((l: Lang) => {
    _setLang(l);
    persist({ lang: l });
    console.log('[Settings] lang →', l);
  }, [persist]);

  const setBrightness = useCallback((b: number) => {
    _setBrightness(b);
    persist({ brightness: b });
    console.log('[Settings] brightness →', b);
  }, [persist]);

  return (
    <SettingsContext.Provider value={{ lang, brightness, setLang, setBrightness }}>
      {children}
    </SettingsContext.Provider>
  );
}
