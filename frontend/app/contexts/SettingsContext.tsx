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

// ── Theme ──────────────────────────────────────────────────────────────────────
// The app has two looks, light and dark, both the landing page's (globals.css,
// "ATLAS"). Brightness above 65 is light, as on the landing page; the rest is
// dark. The colours themselves live in the stylesheet, keyed on data-theme.
export const LIGHT_ABOVE = 65;
/** What Settings sets for each look. */
export const DARK_BRIGHTNESS = 10;
export const LIGHT_BRIGHTNESS = 90;

function applyTheme(brightness: number) {
  const root = document.documentElement;
  root.dataset.theme = brightness > LIGHT_ABOVE ? 'light' : 'dark';
  // Older versions set these inline, which would win over the stylesheet.
  for (const name of ['--bg', '--bg-elevated', '--panel', '--panel2', '--text', '--text-soft', '--border', '--shadow-soft']) {
    root.style.removeProperty(name);
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
