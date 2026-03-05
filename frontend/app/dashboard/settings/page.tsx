// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const SETTINGS = [
  {
    group: "Appearance",
    icon: "🎨",
    items: [
      { id: "theme",    label: "Theme",        desc: "Choose your preferred color scheme.", type: "select", options: ["Dark", "Light", "System"], tba: true },
      { id: "compact",  label: "Compact mode", desc: "Reduce spacing and card padding.",    type: "toggle", default: false, tba: true },
      { id: "animate",  label: "Animations",   desc: "Enable interface transitions.",       type: "toggle", default: true,  tba: true },
    ],
  },
  {
    group: "Language & Region",
    icon: "🌐",
    items: [
      { id: "language", label: "Language",      desc: "Interface language.",                type: "select", options: ["English", "French", "Arabic"], tba: true },
      { id: "dateformat",label: "Date format",  desc: "How dates are displayed.",           type: "select", options: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"], tba: true },
    ],
  },
  {
    group: "Notifications",
    icon: "🔔",
    items: [
      { id: "email_notif",  label: "Email notifications", desc: "Receive updates about your analysis.",       type: "toggle", default: true,  tba: true },
      { id: "report_ready", label: "Report ready alerts",  desc: "Notify when your PDF report is complete.", type: "toggle", default: true,  tba: true },
    ],
  },
  {
    group: "Privacy",
    icon: "🔒",
    items: [
      { id: "analytics", label: "Usage analytics", desc: "Help improve DIG by sharing anonymous usage data.", type: "toggle", default: false, tba: true },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [values, setValues] = useState(() => {
    const init = {};
    SETTINGS.forEach(g => g.items.forEach(item => {
      init[item.id] = item.type === "select" ? item.options?.[0] : item.default;
    }));
    return init;
  });

  const toggle = (id) => setValues(p => ({ ...p, [id]: !p[id] }));
  const select = (id, v) => setValues(p => ({ ...p, [id]: v }));

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>

        <button onClick={() => router.push("/dashboard")} style={backBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </button>

        <div>
          <h1 style={pageTitleStyle}>Website Settings</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "0.85rem" }}>
            Customize your DIG experience. All settings are coming soon — nothing is saved yet.
          </p>
        </div>

        {/* TBA banner */}
        <div style={tbaBannerStyle}>
          <span style={{ fontSize: "15px" }}>🚧</span>
          <span style={{ fontSize: "0.82rem", color: "#fcd34d" }}>
            These settings are placeholders — implementation is planned for a future release.
          </span>
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
                borderTop: idx > 0 ? "1px solid rgba(31,41,55,0.6)" : "none",
                paddingTop: idx > 0 ? "14px" : "0",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "#d1d5db" }}>{item.label}</p>
                    <span style={tbaPillStyle}>TBA</span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#4b5563" }}>{item.desc}</p>
                </div>

                {item.type === "toggle" && (
                  <div
                    onClick={() => toggle(item.id)}
                    style={{
                      ...toggleTrackStyle,
                      background: values[item.id] ? "rgba(37,99,235,0.35)" : "rgba(31,41,55,0.8)",
                      borderColor: values[item.id] ? "rgba(37,99,235,0.5)" : "rgba(55,65,81,0.7)",
                      cursor: "not-allowed",
                      opacity: 0.55,
                    }}
                    title="Coming soon"
                  >
                    <div style={{
                      ...toggleThumbStyle,
                      transform: values[item.id] ? "translateX(18px)" : "translateX(2px)",
                      background: values[item.id] ? "#60a5fa" : "#374151",
                    }} />
                  </div>
                )}

                {item.type === "select" && (
                  <select
                    disabled
                    value={values[item.id]}
                    onChange={e => select(item.id, e.target.value)}
                    style={disabledSelectStyle}
                    title="Coming soon"
                  >
                    {item.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#374151", padding: "8px 0 24px" }}>
          Settings are per-device and stored locally once implemented.
        </p>

      </div>
    </div>
  );
}

const pageStyle        = { minHeight: "100vh", background: "radial-gradient(circle at top, #020617 0, #020617 45%, #000 100%)", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#e5e7eb" };
const wrapStyle        = { maxWidth: "620px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" };
const backBtnStyle     = { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, width: "fit-content" };
const pageTitleStyle   = { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#f1f5f9" };
const sectionStyle     = { display: "flex", flexDirection: "column", gap: "14px" };
const groupHeadStyle   = { margin: 0, fontSize: "0.82rem", color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 };
const itemRowStyle     = { display: "flex", alignItems: "center", gap: "16px" };
const tbaBannerStyle   = { display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderRadius: "12px", background: "rgba(120,53,15,0.2)", border: "1px solid rgba(180,83,9,0.3)" };
const tbaPillStyle     = { fontSize: "0.62rem", fontWeight: 700, color: "#92400e", background: "rgba(120,53,15,0.3)", border: "1px solid rgba(180,83,9,0.3)", borderRadius: "999px", padding: "1px 6px", letterSpacing: "0.06em" };
const toggleTrackStyle = { width: "38px", height: "22px", borderRadius: "999px", border: "1px solid", transition: "all 0.2s", display: "flex", alignItems: "center", flexShrink: 0, position: "relative" };
const toggleThumbStyle = { width: "16px", height: "16px", borderRadius: "999px", transition: "transform 0.2s, background 0.2s", position: "absolute" };
const disabledSelectStyle = { background: "rgba(15,23,42,0.5)", border: "1px solid rgba(55,65,81,0.6)", borderRadius: "8px", padding: "7px 12px", fontSize: "0.82rem", color: "#374151", cursor: "not-allowed", flexShrink: 0 };