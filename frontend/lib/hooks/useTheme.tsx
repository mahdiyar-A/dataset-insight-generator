"use client";
import { useEffect, useState } from "react";

type Theme = "Dark" | "Light" | "System";

// ── Accent maps (kept in sync with settings/page.tsx) ──────────────────────
const ACCENT_MAP: Record<string, [string, string]> = {
  Blue:   ["#3b82f6", "#6366f1"],
  Purple: ["#7c3aed", "#a78bfa"],
  Teal:   ["#0ea5a4", "#34d399"],
  Sunset: ["#ff7a18", "#ffb86b"],
  Green:  ["#10b981", "#22c55e"],
};
const ACCENT_RGB: Record<string, string> = {
  Blue:   "59,130,246",
  Purple: "124,58,237",
  Teal:   "14,165,164",
  Sunset: "255,122,24",
  Green:  "16,185,129",
};

function applyAccentVars(name: string) {
  const cols = ACCENT_MAP[name] ?? ACCENT_MAP["Blue"];
  const rgb  = ACCENT_RGB[name] ?? ACCENT_RGB["Blue"];
  const root = document.documentElement;
  root.style.setProperty("--accent",          cols[0]);
  root.style.setProperty("--accent2",         cols[1]);
  root.style.setProperty("--accent1",         cols[0]);
  root.style.setProperty("--accent-rgb",      rgb);
  root.style.setProperty("--accent-gradient", `linear-gradient(90deg, ${cols[0]}, ${cols[1]})`);
  root.style.setProperty("--accent-soft",     `rgba(${rgb},0.13)`);
}

/** Reads persisted accent from localStorage, applies CSS vars, and lets consumers set it. */
export function useAccent() {
  const [accent, setAccentState] = useState<string>(() => {
    try {
      return (typeof window !== "undefined" && localStorage.getItem("setting_accent")) || "Blue";
    } catch {
      return "Blue";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      applyAccentVars(accent);
      localStorage.setItem("setting_accent", accent);
    } catch {}
  }, [accent]);

  const setAccent = (name: string) => setAccentState(name);
  return { accent, setAccent };
}

export function useTheme(initial?: Theme) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("app_theme") : null;
      return (stored as Theme) || initial || "System";
    } catch {
      return initial || "System";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (theme === "Dark") {
        document.documentElement.classList.add("dark");
      } else if (theme === "Light") {
        document.documentElement.classList.remove("dark");
      } else {
        // System: remove explicit class so system preference governs
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("app_theme", theme);
    } catch (e) {
      // ignore storage errors
    }
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return { theme, setTheme };
}

export function useLanguage(initial?: string) {
  const [lang, setLangState] = useState(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("app_lang") : null;
      return stored || initial || "English";
    } catch {
      return initial || "English";
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem("app_lang", lang);
    } catch {}
  }, [lang]);

  return { lang, setLang: setLangState };
}
