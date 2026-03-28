"use client";
// @ts-nocheck

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme, useAccent } from "../../../lib/hooks/useTheme";
import { useLanguage } from "@/app/contexts/LanguageContext";

const SETTINGS = [
  {
    group: "Appearance",
    icon: "🎨",
    items: [
      { id: "theme",   label: "Theme",        desc: "Choose your preferred color scheme.",          type: "select", options: ["Dark", "Light", "System"] },
      { id: "accent",  label: "Accent",       desc: "Choose an accent gradient for highlights.",    type: "select", options: ["Blue", "Purple", "Teal", "Sunset", "Green"], default: "Blue" },
      { id: "compact", label: "Compact mode", desc: "Reduce spacing and card padding.",             type: "toggle", default: false },
      { id: "animate", label: "Animations",   desc: "Enable interface transitions.",                type: "toggle", default: true },
    ],
  },
  {
    group: "Language & Region",
    icon: "🌐",
    items: [
      { id: "language",   label: "Language",    desc: "Interface language.",       type: "select", options: ["English", "French"] },
    ],
  },

];

// Bidirectional maps between locale codes and display strings
const LOCALE_TO_OPTION: Record<string, string> = { en: "English", fr: "French" };
const OPTION_TO_LOCALE: Record<string, string> = { English: "en", French: "fr" };

function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backPath = from === "guest" ? "/guestDashboard" : "/dashboard";

  const t = useTranslations("settings");
  const { locale, setLocale } = useLanguage();
  const { setTheme } = useTheme();
  const { setAccent } = useAccent();

  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    SETTINGS.forEach((g) =>
      g.items.forEach((item) => {
        init[item.id] = item.type === "select" ? item.options?.[0] : (item.default ?? false);
        try {
          if (typeof window !== "undefined") {
            if (item.id === "language") {
              init[item.id] = LOCALE_TO_OPTION[locale] ?? "English";
            } else {
              const stored = localStorage.getItem(`setting_${item.id}`);
              if (stored !== null) {
                init[item.id] = item.type === "toggle" ? stored === "true" : stored;
              }
            }
          }
        } catch {}
      })
    );
    return init;
  });

  const persist = (id: string, v: any) => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(`setting_${id}`, String(v));
    } catch {}
  };

  const toggle = (id: string) => {
    setValues((p) => {
      const next = { ...p, [id]: !p[id] };
      persist(id, next[id]);
      return next;
    });
  };

  const select = (id: string, v: string) => {
    setValues((p) => ({ ...p, [id]: v }));
    persist(id, v);
    if (id === "theme")    setTheme(v as any);
    if (id === "language" && OPTION_TO_LOCALE[v]) setLocale(OPTION_TO_LOCALE[v] as "en" | "fr");
    if (id === "accent")   setAccent(v);
  };

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (values.compact) document.documentElement.classList.add("compact");
      else document.documentElement.classList.remove("compact");
      if (values.animate === false) document.documentElement.classList.add("reduced-motion");
      else document.documentElement.classList.remove("reduced-motion");
    } catch {}
  }, [values.compact, values.animate]);

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>

        <button onClick={() => router.push(backPath)} style={backBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("backToDashboard")}
        </button>

        <div>
          <h1 style={pageTitleStyle}>{t("title")}</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-soft)", fontSize: "0.9rem" }}>
            {t("desc")}
          </p>
        </div>

        {SETTINGS.map((group) => (
          <div key={group.group} className="card" style={sectionStyle}>
            <h2 style={groupHeadStyle}>
              <span style={{ marginRight: "8px" }}>{group.icon}</span>
              {group.group}
            </h2>

            {group.items.map((item, idx) => (
              <div key={item.id} style={{
                ...itemRowStyle,
                borderTop: idx > 0 ? "1px solid var(--border)" : "none",
                paddingTop: idx > 0 ? "14px" : "0",
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{item.label}</p>
                  <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--text-soft)" }}>{item.desc}</p>
                </div>

                {item.type === "toggle" && (
                  <div
                    onClick={() => toggle(item.id)}
                    style={{
                      ...toggleTrackStyle,
                      background: values[item.id] ? "var(--accent-soft)" : "var(--panel)",
                      borderColor: values[item.id] ? "var(--accent)" : "var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{
                      ...toggleThumbStyle,
                      transform: values[item.id] ? "translateX(18px)" : "translateX(2px)",
                      background: values[item.id] ? "var(--accent)" : "var(--muted)",
                    }} />
                  </div>
                )}

                {item.type === "select" && (
                  <select
                    value={values[item.id]}
                    onChange={e => select(item.id, e.target.value)}
                    style={enabledSelectStyle}
                  >
                    {item.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-soft)", padding: "8px 0 24px" }}>
          {t("footer")}
        </p>

      </div>
    </div>
  );
}

export default function SettingsPageWrapper() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties        = { minHeight: "100vh", background: "var(--bg)", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "var(--text)" };
const wrapStyle: React.CSSProperties        = { maxWidth: "620px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" };
const backBtnStyle: React.CSSProperties     = { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "var(--text-soft)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, width: "fit-content" };
const pageTitleStyle: React.CSSProperties   = { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" };
const sectionStyle: React.CSSProperties     = { display: "flex", flexDirection: "column", gap: "14px" };
const groupHeadStyle: React.CSSProperties   = { margin: 0, fontSize: "0.82rem", color: "var(--text-soft)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 };
const itemRowStyle: React.CSSProperties     = { display: "flex", alignItems: "center", gap: "16px" };
const toggleTrackStyle: React.CSSProperties = { width: "38px", height: "22px", borderRadius: "999px", border: "1px solid", transition: "all 0.2s", display: "flex", alignItems: "center", flexShrink: 0, position: "relative" };
const toggleThumbStyle: React.CSSProperties = { width: "16px", height: "16px", borderRadius: "999px", transition: "transform 0.2s, background 0.2s", position: "absolute" };
const enabledSelectStyle: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 12px", fontSize: "0.82rem", color: "var(--text)", cursor: "pointer", flexShrink: 0 };