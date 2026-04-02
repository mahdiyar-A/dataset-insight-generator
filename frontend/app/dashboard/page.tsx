// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Translations ─────────────────────────────────────────────────────────────
const T = {
  en: {
    title: "Settings", subtitle: "Customize your DIG experience.", back: "Back to Dashboard", saved: "Saved",
    appearance: "Appearance", theme: "Theme", themeDesc: "Drag to adjust brightness from dark to light.",
    language: "Language & Region", languageLabel: "Interface Language", languageDesc: "Choose the language used across the entire platform.",
    notifications: "Notifications", emailNotif: "Email Notifications", emailNotifDesc: "Receive updates and summaries about your analyses.",
    reportReady: "Report Ready Alerts", reportReadyDesc: "Get notified when your PDF or PowerPoint report is complete.",
    privacy: "Privacy", analytics: "Usage Analytics", analyticsDesc: "Help improve DIG by sharing anonymous usage data.",
    tba: "Coming Soon", compact: "Compact Mode", compactDesc: "Reduce spacing and card padding.",
    animations: "Animations", animationsDesc: "Enable interface transitions and micro-interactions.",
    dateFormat: "Date Format", dateFormatDesc: "How dates are displayed across the platform.",
    dark: "Dark", light: "Light",
  },
  fr: {
    title: "Paramètres", subtitle: "Personnalisez votre expérience DIG.", back: "Retour au tableau de bord", saved: "Enregistré",
    appearance: "Apparence", theme: "Thème", themeDesc: "Faites glisser pour ajuster la luminosité.",
    language: "Langue et région", languageLabel: "Langue de l'interface", languageDesc: "Choisissez la langue utilisée sur toute la plateforme.",
    notifications: "Notifications", emailNotif: "Notifications par e-mail", emailNotifDesc: "Recevez des mises à jour sur vos analyses.",
    reportReady: "Alertes rapport prêt", reportReadyDesc: "Soyez notifié quand votre rapport est prêt.",
    privacy: "Confidentialité", analytics: "Statistiques d'utilisation", analyticsDesc: "Aidez à améliorer DIG en partageant des données anonymes.",
    tba: "Bientôt disponible", compact: "Mode compact", compactDesc: "Réduire l'espacement des cartes.",
    animations: "Animations", animationsDesc: "Activer les transitions et micro-interactions.",
    dateFormat: "Format de date", dateFormatDesc: "Comment les dates sont affichées.",
    dark: "Sombre", light: "Clair",
  },
  fa: {
    title: "تنظیمات", subtitle: "تجربه DIG خود را سفارشی کنید.", back: "بازگشت به داشبورد", saved: "ذخیره شد",
    appearance: "ظاهر", theme: "تم", themeDesc: "برای تنظیم روشنایی بکشید.",
    language: "زبان و منطقه", languageLabel: "زبان رابط کاربری", languageDesc: "زبان مورد استفاده در کل پلتفرم را انتخاب کنید.",
    notifications: "اعلان‌ها", emailNotif: "اعلان‌های ایمیل", emailNotifDesc: "به‌روزرسانی‌ها درباره تحلیل‌هایتان را دریافت کنید.",
    reportReady: "هشدار آماده بودن گزارش", reportReadyDesc: "وقتی گزارش شما آماده شد اطلاع داده می‌شود.",
    privacy: "حریم خصوصی", analytics: "آمار استفاده", analyticsDesc: "با اشتراک‌گذاری داده‌های ناشناس به بهبود DIG کمک کنید.",
    tba: "به زودی", compact: "حالت فشرده", compactDesc: "فاصله‌گذاری کارت‌ها را کاهش دهید.",
    animations: "انیمیشن‌ها", animationsDesc: "انتقال‌ها و تعاملات ریز را فعال کنید.",
    dateFormat: "قالب تاریخ", dateFormatDesc: "نحوه نمایش تاریخ‌ها در پلتفرم.",
    dark: "تاریک", light: "روشن",
  },
};

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "fa", label: "فارسی", flag: "🇮🇷" },
];

function applyTheme(brightness: number) {
  const root = document.documentElement;
  const isLight = brightness > 65;
  const isDark = brightness < 35;

  if (isLight) {
    root.style.setProperty("--bg", `hsl(220,20%,${88 + brightness * 0.1}%)`);
    root.style.setProperty("--bg-elevated", `hsl(220,18%,94%)`);
    root.style.setProperty("--panel", `rgba(255,255,255,0.9)`);
    root.style.setProperty("--panel2", `hsl(220,20%,${88 + brightness * 0.1}%)`);
    root.style.setProperty("--text", "#111827");
    root.style.setProperty("--text-soft", "#4b5563");
    root.style.setProperty("--border", "#d1d5db");
    root.style.setProperty("--shadow-soft", "0 4px 20px rgba(0,0,0,0.08)");
  } else if (isDark) {
    const d = (35 - brightness) / 35;
    root.style.setProperty("--bg", `hsl(222,${30 + d * 8}%,${3 + brightness * 0.15}%)`);
    root.style.setProperty("--bg-elevated", `hsl(222,26%,${5 + brightness * 0.2}%)`);
    root.style.setProperty("--panel", `hsl(220,22%,${8 + brightness * 0.3}%)`);
    root.style.setProperty("--panel2", `hsl(222,30%,${3 + brightness * 0.15}%)`);
    root.style.setProperty("--text", "#e5e7eb");
    root.style.setProperty("--text-soft", "#9ca3af");
    root.style.setProperty("--border", `hsl(220,20%,${10 + brightness * 0.25}%)`);
    root.style.setProperty("--shadow-soft", `0 18px 45px rgba(0,0,0,${0.9 - brightness * 0.01})`);
  } else {
    const pct = (brightness - 35) / 30;
    root.style.setProperty("--bg", `hsl(222,22%,${10 + brightness * 0.35}%)`);
    root.style.setProperty("--bg-elevated", `hsl(222,18%,${13 + brightness * 0.35}%)`);
    root.style.setProperty("--panel", `hsl(220,16%,${18 + brightness * 0.45}%)`);
    root.style.setProperty("--panel2", `hsl(222,22%,${10 + brightness * 0.35}%)`);
    root.style.setProperty("--text", pct > 0.6 ? "#1f2937" : "#e5e7eb");
    root.style.setProperty("--text-soft", pct > 0.6 ? "#4b5563" : "#9ca3af");
    root.style.setProperty("--border", `hsl(220,14%,${22 + brightness * 0.38}%)`);
    root.style.setProperty("--shadow-soft", "0 10px 32px rgba(0,0,0,0.45)");
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const saveTimerRef = useRef(null);

  const [lang, setLang] = useState("en");
  const [brightness, setBrightness] = useState(10);
  const [emailNotif, setEmailNotif] = useState(true);
  const [reportReady, setReportReady] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);

  const t = T[lang] || T.en;
  const isLight = brightness > 65;
  const textColor = isLight ? "#111827" : "#e5e7eb";
  const textSoft = isLight ? "#4b5563" : "#9ca3af";
  const cardBg = isLight ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.55)";
  const cardBorder = isLight ? "rgba(209,213,219,0.8)" : "rgba(31,41,55,0.7)";
  const pageBackground = isLight
    ? "radial-gradient(circle at top, #dde6f0 0%, #f0f4f8 100%)"
    : `radial-gradient(circle at top, hsl(222,30%,${3 + brightness * 0.18}%) 0%, hsl(220,35%,${2 + brightness * 0.12}%) 100%)`;

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("dig_settings") || "{}");
      if (s.brightness !== undefined) { setBrightness(s.brightness); applyTheme(s.brightness); }
      if (s.lang) setLang(s.lang);
      if (s.emailNotif !== undefined) setEmailNotif(s.emailNotif);
      if (s.reportReady !== undefined) setReportReady(s.reportReady);
    } catch {}
  }, []);

  useEffect(() => { applyTheme(brightness); }, [brightness]);

  useEffect(() => {
    document.documentElement.setAttribute("dir", lang === "fa" ? "rtl" : "ltr");
  }, [lang]);

  function persist(patch = {}) {
    const cur = JSON.parse(localStorage.getItem("dig_settings") || "{}");
    localStorage.setItem("dig_settings", JSON.stringify({ ...cur, brightness, lang, emailNotif, reportReady, ...patch }));
    setSavedFlash(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedFlash(false), 1800);
  }

  const rtl = lang === "fa";
  const cardStyle = {
    background: cardBg, backdropFilter: "blur(14px)",
    border: `1px solid ${cardBorder}`, borderRadius: "18px", padding: "22px",
    display: "flex", flexDirection: "column" as const, gap: "18px",
    boxShadow: isLight ? "0 4px 20px rgba(0,0,0,0.07)" : "0 8px 36px rgba(0,0,0,0.4)",
    transition: "background 0.35s, border-color 0.35s, box-shadow 0.35s",
  };
  const groupHead = {
    margin: 0, fontSize: "0.76rem", color: textSoft,
    letterSpacing: "0.07em", textTransform: "uppercase" as const, fontWeight: 700,
  };
  const divider = { height: "1px", background: cardBorder };

  return (
    <div style={{ minHeight: "100vh", background: pageBackground, padding: "32px 20px", fontFamily: "system-ui,-apple-system,sans-serif", color: textColor, transition: "background 0.4s,color 0.3s", direction: rtl ? "rtl" : "ltr" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => router.push("/dashboard")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: textSoft, cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points={rtl ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
            </svg>
            {t.back}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", opacity: savedFlash ? 1 : 0, transition: "opacity 0.3s", fontSize: "0.78rem", color: "#22c55e", fontWeight: 600 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {t.saved}
          </div>
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{t.title}</h1>
          <p style={{ margin: "4px 0 0", color: textSoft, fontSize: "0.85rem" }}>{t.subtitle}</p>
        </div>

        {/* ── APPEARANCE ── */}
        <div style={cardStyle}>
          <h2 style={groupHead}>🎨 {t.appearance}</h2>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{t.theme}</p>
                <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: textSoft }}>{t.themeDesc}</p>
              </div>
              <span style={{ fontSize: "1.1rem" }}>{brightness < 25 ? "🌑" : brightness < 50 ? "🌗" : brightness < 70 ? "🌤" : "☀️"}</span>
            </div>
            {/* Slider */}
            <div style={{ position: "relative", height: "28px", display: "flex", alignItems: "center" }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: "8px", borderRadius: "999px", background: "linear-gradient(to right,#020617 0%,#1e3a5f 20%,#374151 42%,#6b7280 60%,#cbd5e1 80%,#f8fafc 100%)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" }} />
              <input type="range" min={0} max={100} value={brightness}
                onChange={e => setBrightness(Number(e.target.value))}
                onMouseUp={() => persist({ brightness })}
                onTouchEnd={() => persist({ brightness })}
                style={{ position: "absolute", width: "100%", height: "8px", appearance: "none", WebkitAppearance: "none", background: "transparent", cursor: "pointer", margin: 0, padding: 0 }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
              <span style={{ fontSize: "0.7rem", color: textSoft }}>{t.dark}</span>
              <span style={{ fontSize: "0.7rem", color: textSoft }}>{t.light}</span>
            </div>
          </div>
        </div>

        {/* ── LANGUAGE ── */}
        <div style={cardStyle}>
          <h2 style={groupHead}>🌐 {t.language}</h2>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>{t.languageLabel}</p>
            <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: textSoft }}>{t.languageDesc}</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
              {LANGUAGES.map(l => (
                <button key={l.code} onClick={() => { setLang(l.code); persist({ lang: l.code }); }} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "12px", cursor: "pointer",
                  fontSize: "0.84rem", fontWeight: lang === l.code ? 700 : 500,
                  border: lang === l.code ? "1px solid rgba(37,99,235,0.55)" : `1px solid ${cardBorder}`,
                  background: lang === l.code ? "rgba(37,99,235,0.16)" : isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
                  color: lang === l.code ? "#3b82f6" : textColor,
                  transition: "all 0.18s",
                  fontFamily: l.code === "fa" ? "Tahoma,Arial,sans-serif" : "inherit",
                }}>
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                  {lang === l.code && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── NOTIFICATIONS ── */}
        <div style={cardStyle}>
          <h2 style={groupHead}>🔔 {t.notifications}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{t.emailNotif}</p>
              <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: textSoft }}>{t.emailNotifDesc}</p>
            </div>
            <Toggle active={emailNotif} onToggle={() => { const n = !emailNotif; setEmailNotif(n); persist({ emailNotif: n }); }} />
          </div>
          <div style={divider} />
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{t.reportReady}</p>
              <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: textSoft }}>{t.reportReadyDesc}</p>
            </div>
            <Toggle active={reportReady} onToggle={() => { const n = !reportReady; setReportReady(n); persist({ reportReady: n }); }} />
          </div>
        </div>

        {/* ── COMING SOON ── */}
        <div style={{ ...cardStyle, opacity: 0.55 }}>
          <h2 style={groupHead}>🚧 {t.tba}</h2>
          {[
            { label: t.compact, desc: t.compactDesc },
            { label: t.animations, desc: t.animationsDesc },
            { label: t.dateFormat, desc: t.dateFormatDesc },
            { label: t.analytics, desc: t.analyticsDesc },
          ].map((item, i, arr) => (
            <div key={item.label}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{item.label}</p>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#92400e", background: "rgba(120,53,15,0.25)", border: "1px solid rgba(180,83,9,0.3)", borderRadius: "999px", padding: "1px 6px" }}>TBA</span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: textSoft }}>{item.desc}</p>
                </div>
                <Toggle active={false} onToggle={() => {}} disabled />
              </div>
              {i < arr.length - 1 && <div style={divider} />}
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: "0.72rem", color: textSoft, paddingBottom: "24px" }}>
          Settings are saved locally on this device.
        </p>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid rgba(37,99,235,0.7);box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;transition:transform .15s,box-shadow .15s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.15);box-shadow:0 3px 12px rgba(37,99,235,0.45)}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid rgba(37,99,235,0.7);box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer}
      `}</style>
    </div>
  );
}

function Toggle({ active, onToggle, disabled = false }: { active: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div onClick={disabled ? undefined : onToggle} style={{
      width: "42px", height: "24px", borderRadius: "999px",
      border: `1px solid ${active ? "rgba(37,99,235,0.55)" : "rgba(55,65,81,0.6)"}`,
      background: active ? "rgba(37,99,235,0.28)" : "rgba(31,41,55,0.5)",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", flexShrink: 0, position: "relative",
      transition: "background 0.2s,border-color 0.2s",
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{
        width: "17px", height: "17px", borderRadius: "50%",
        background: active ? "#60a5fa" : "#4b5563",
        position: "absolute",
        transform: active ? "translateX(21px)" : "translateX(3px)",
        transition: "transform 0.2s,background 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}