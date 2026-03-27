"use client";
// @ts-nocheck

import React, { useState, useEffect, Suspense } from "react";
import { useTheme, useLanguage, useAccent } from "../../../lib/hooks/useTheme";
import { useRouter, useSearchParams } from "next/navigation";

// SETTINGS: UI groups and controls with defaults and option lists.
// Each item: { id, label, desc, type: 'select'|'toggle', options?, default? }
const SETTINGS = [
  {
    group: "Appearance",
    icon: "🎨",
    items: [
      { id: "theme",    label: "Theme",        desc: "Choose your preferred color scheme.", type: "select", options: ["Dark", "Light", "System"] },
      { id: "accent",   label: "Accent",       desc: "Choose an accent gradient for highlights.", type: "select", options: ["Blue", "Purple", "Teal", "Sunset", "Green"], default: "Blue" },
      { id: "compact",  label: "Compact mode", desc: "Reduce spacing and card padding.",    type: "toggle", default: false },
      { id: "animate",  label: "Animations",   desc: "Enable interface transitions.",       type: "toggle", default: true },
    ],
  },
  {
    group: "Language & Region",
    icon: "🌐",
    items: [
      { id: "language", label: "Language",      desc: "Interface language.",                type: "select", options: ["English", "French", "Arabic"] },
      { id: "dateformat",label: "Date format",  desc: "How dates are displayed.",           type: "select", options: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] },
    ],
  },
  {
    group: "Notifications",
    icon: "🔔",
    items: [
      { id: "email_notif",  label: "Email notifications", desc: "Receive updates about your analysis.",       type: "toggle", default: true },
      { id: "report_ready", label: "Report ready alerts",  desc: "Notify when your PDF report is complete.", type: "toggle", default: true },
    ],
  },
  {
    group: "Privacy",
    icon: "🔒",
    items: [
      { id: "analytics", label: "Usage analytics", desc: "Help improve DIG by sharing anonymous usage data.", type: "toggle", default: false },
    ],
  },
];

function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Detect which dashboard navigated here so Back goes to the right place.
  const from = searchParams.get("from");  // e.g. ?from=guest
  const backPath = from === "guest" ? "/guestDashboard" : "/dashboard";
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const { setAccent } = useAccent();

  // Initialize `values` with defaults and any persisted overrides from localStorage.
  // Uses `setting_<id>` keys for per-device persistence, while keeping `app_theme` and `app_lang` compatible with existing hooks.
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    SETTINGS.forEach((g) =>
      g.items.forEach((item) => {
        // default value: first option for selects, explicit default for toggles
        init[item.id] = item.type === "select" ? item.options?.[0] : item.default ?? false;
        try {
          if (typeof window !== "undefined") {
            const key = `setting_${item.id}`;
            const stored = localStorage.getItem(key);
            if (stored !== null) {
              // Restore persisted toggle/string value; toggles are stored as "true"/"false"
              init[item.id] = item.type === "toggle" ? stored === "true" : stored;
            }
          }
        } catch {}
      })
    );
    try {
      if (typeof window !== "undefined") {
        const st = localStorage.getItem("app_theme"); if (st) init["theme"] = st;
        const lg = localStorage.getItem("app_lang");  if (lg) init["language"] = lg;
      }
    } catch {}
    return init;
  });

  // Persist a single setting under `setting_<id>`.
  const persist = (id: string, v: any) => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(`setting_${id}`, String(v));
    } catch {}
  };

  // Toggle handler: flip boolean, persist, and update state.
  const toggle = (id: string) => {
    setValues((p) => {
      const next = { ...p, [id]: !p[id] } as Record<string, any>;
      persist(id, next[id]);
      return next;
    });
  };

  // Select handler: set arbitrary string option, persist, and apply global hooks for theme/language.
  const select = (id: string, v: any) => {
    setValues((p) => {
      const next = { ...p, [id]: v } as Record<string, any>;
      persist(id, v);
      return next;
    });
    if (id === "theme")    setTheme(v);
    if (id === "language") setLang(v);
    if (id === "accent")   setAccent(v);
  };

  // Side-effects: apply global CSS classes when compact/animate settings change.
  // Consumers can target `.compact` or `.reduced-motion` in CSS to adjust spacing/animations.
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (values.compact) document.documentElement.classList.add("compact"); else document.documentElement.classList.remove("compact");
      if (values.animate === false) document.documentElement.classList.add("reduced-motion"); else document.documentElement.classList.remove("reduced-motion");
    } catch {}
  }, [values.compact, values.animate]);

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>

        <button onClick={() => router.push(backPath)} style={backBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </button>

        <div>
          <h1 style={pageTitleStyle}>Settings</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-soft)", fontSize: "0.9rem" }}>
            Customize your DIG experience — changes apply immediately and persist per-device.
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
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{item.label}</p>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--text-soft)" }}>{item.desc}</p>
                </div>

                    {item.type === "toggle" && (
                  <div
                    onClick={() => toggle(item.id)}
                    style={{
                      ...toggleTrackStyle,
                      background: values[item.id] ? "var(--accent-soft)" : "var(--panel)",
                      borderColor: values[item.id] ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                      cursor: "pointer",
                      opacity: 1,
                    }}
                    title={"Toggle"}
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
                    title={"Change setting"}
                  >
                    {item.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-soft)", padding: "8px 0 24px" }}>
          Settings are per-device and stored locally once implemented.
        </p>

      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "var(--bg)", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "var(--text)" };
const wrapStyle: React.CSSProperties = { maxWidth: "620px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" };
const backBtnStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "var(--text-soft)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, width: "fit-content" };
const pageTitleStyle: React.CSSProperties = { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" };
const sectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "14px" };
const groupHeadStyle: React.CSSProperties = { margin: 0, fontSize: "0.82rem", color: "var(--text-soft)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 };
const itemRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "16px" };
const tbaBannerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderRadius: "12px", background: "rgba(120,53,15,0.2)", border: "1px solid rgba(180,83,9,0.3)" };
const tbaPillStyle: React.CSSProperties = { fontSize: "0.62rem", fontWeight: 700, color: "#92400e", background: "rgba(120,53,15,0.3)", border: "1px solid rgba(180,83,9,0.3)", borderRadius: "999px", padding: "1px 6px", letterSpacing: "0.06em" };
const toggleTrackStyle: React.CSSProperties = { width: "38px", height: "22px", borderRadius: "999px", border: "1px solid", transition: "all 0.2s", display: "flex", alignItems: "center", flexShrink: 0, position: "relative" } as React.CSSProperties;
const toggleThumbStyle: React.CSSProperties = { width: "16px", height: "16px", borderRadius: "999px", transition: "transform 0.2s, background 0.2s", position: "absolute" };
const disabledSelectStyle: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 12px", fontSize: "0.82rem", color: "var(--muted)", cursor: "not-allowed", flexShrink: 0 };
const enabledSelectStyle: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 12px", fontSize: "0.82rem", color: "var(--text)", cursor: "pointer", flexShrink: 0 };

export default function SettingsPageWrapper() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}