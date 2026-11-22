"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/app/contexts/SettingsContext";
import { DARK_BRIGHTNESS, LIGHT_BRIGHTNESS, LIGHT_ABOVE, type Lang } from "@/app/contexts/SettingsContext";

// ─── Translations ─────────────────────────────────────────────────────────────
const T = {
  en: {
    title: "Settings", subtitle: "Customize your DIG experience.", back: "Back to Dashboard", saved: "Saved",
    appearance: "Appearance", theme: "Theme", themeDesc: "How DIG looks, here and on the home page.",
    language: "Language & Region", languageLabel: "Interface Language", languageDesc: "Choose the language used across the entire platform.",
    emailNotif: "Email Notifications", emailNotifDesc: "Receive updates and summaries about your analyses.",
    reportReady: "Report Ready Alerts", reportReadyDesc: "Get notified when your PDF or PowerPoint report is complete.",
    privacy: "Privacy", analytics: "Usage Analytics", analyticsDesc: "Help improve DIG by sharing anonymous usage data.",
    tba: "Coming Soon", compact: "Compact Mode", compactDesc: "Reduce spacing and card padding.",
    animations: "Animations", animationsDesc: "Enable interface transitions and micro-interactions.",
    dateFormat: "Date Format", dateFormatDesc: "How dates are displayed across the platform.",
    dark: "Dark", light: "Light",
  },
  fr: {
    title: "Paramètres", subtitle: "Personnalisez votre expérience DIG.", back: "Retour au tableau de bord", saved: "Enregistré",
    appearance: "Apparence", theme: "Thème", themeDesc: "L'apparence de DIG, ici et sur la page d'accueil.",
    language: "Langue et région", languageLabel: "Langue de l'interface", languageDesc: "Choisissez la langue utilisée sur toute la plateforme.",
    emailNotif: "Notifications par e-mail", emailNotifDesc: "Recevez des mises à jour sur vos analyses.",
    reportReady: "Alertes rapport prêt", reportReadyDesc: "Soyez notifié quand votre rapport est prêt.",
    privacy: "Confidentialité", analytics: "Statistiques d'utilisation", analyticsDesc: "Aidez à améliorer DIG en partageant des données anonymes.",
    tba: "Bientôt disponible", compact: "Mode compact", compactDesc: "Réduire l'espacement des cartes.",
    animations: "Animations", animationsDesc: "Activer les transitions et micro-interactions.",
    dateFormat: "Format de date", dateFormatDesc: "Comment les dates sont affichées.",
    dark: "Sombre", light: "Clair",
  },
  fa: {
    title: "تنظیمات", subtitle: "تجربه DIG خود را سفارشی کنید.", back: "بازگشت به داشبورد", saved: "ذخیره شد",
    appearance: "ظاهر", theme: "تم", themeDesc: "ظاهر DIG، اینجا و در صفحه اصلی.",
    language: "زبان و منطقه", languageLabel: "زبان رابط کاربری", languageDesc: "زبان مورد استفاده در کل پلتفرم را انتخاب کنید.",
    emailNotif: "اعلان‌های ایمیل", emailNotifDesc: "به‌روزرسانی‌ها درباره تحلیل‌هایتان را دریافت کنید.",
    reportReady: "هشدار آماده بودن گزارش", reportReadyDesc: "وقتی گزارش شما آماده شد اطلاع داده می‌شود.",
    privacy: "حریم خصوصی", analytics: "آمار استفاده", analyticsDesc: "با اشتراک‌گذاری داده‌های ناشناس به بهبود DIG کمک کنید.",
    tba: "به زودی", compact: "حالت فشرده", compactDesc: "فاصله‌گذاری کارت‌ها را کاهش دهید.",
    animations: "انیمیشن‌ها", animationsDesc: "انتقال‌ها و تعاملات ریز را فعال کنید.",
    dateFormat: "قالب تاریخ", dateFormatDesc: "نحوه نمایش تاریخ‌ها در پلتفرم.",
    dark: "تاریک", light: "روشن",
  },
};

const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "fa", label: "فارسی", flag: "🇮🇷" },
];

// applyTheme is owned by SettingsContext — no local copy needed.

export default function SettingsPage() {
  const router = useRouter();
  // useRef(null) infers `null`, so assigning a timer handle to .current is a
  // type error. Typed explicitly rather than suppressed.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── lang + brightness come from the shared session context ─────────────────
  // Changes here instantly apply everywhere (landing page, dashboard, etc.)
  // and persist for the whole tab session — cleared on logout or tab close.
  const { lang, setLang: ctxSetLang, brightness, setBrightness: ctxSetBrightness } = useSettings();

  const [savedFlash, setSavedFlash] = useState(false);

  // Load non-lang/brightness settings from sessionStorage on mount
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem("dig_settings") || "{}");
    } catch {}
  }, []);

  const t = T[lang] || T.en;
  const isLight = brightness > LIGHT_ABOVE;
  const textColor = isLight ? "var(--ink)" : "var(--ink)";
  const textSoft = isLight ? "var(--ink-faint)" : "var(--ink-soft)";
  const cardBg = "var(--card)";
  const cardBorder = "var(--line)";
  const pageBackground = "var(--paper)";

  function flashSaved() {
    setSavedFlash(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedFlash(false), 1800);
  }

  function setLang(l: Lang) {
    ctxSetLang(l);  // context persists to sessionStorage + applies dir
    flashSaved();
  }

  function setBrightness(b: number) {
    ctxSetBrightness(b);   // context persists to sessionStorage + applies CSS vars
  }

  function persist(patch = {}) {
    const cur = JSON.parse(sessionStorage.getItem("dig_settings") || "{}");
    sessionStorage.setItem("dig_settings", JSON.stringify({ ...cur, ...patch }));
    flashSaved();
  }

  const rtl = lang === "fa";
  const cardStyle = {
    background: cardBg,
    border: "2px solid var(--rule)", padding: "22px",
    display: "flex", flexDirection: "column" as const, gap: "18px",
  };
  const groupHead = {
    margin: 0, fontSize: "0.76rem", color: textSoft,
    letterSpacing: "0.07em", textTransform: "uppercase" as const, fontWeight: 700,
  };
  const divider = { height: "1px", background: cardBorder };

  return (
    <div style={{ minHeight: "100vh", background: pageBackground, padding: "32px 20px", color: textColor, direction: rtl ? "rtl" : "ltr" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => router.push("/dashboard")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: textSoft, cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points={rtl ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
            </svg>
            {t.back}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", opacity: savedFlash ? 1 : 0, transition: "opacity 0.3s", fontSize: "0.78rem", color: "var(--ok-text)", fontWeight: 600 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {t.saved}
          </div>
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: "2.2rem", fontWeight: 800 }}>{t.title}</h1>
          <p style={{ margin: "4px 0 0", color: textSoft, fontSize: "0.85rem" }}>{t.subtitle}</p>
        </div>

        {/* ── APPEARANCE ── */}
        <div style={cardStyle}>
          <h2 style={groupHead}>{t.appearance}</h2>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{t.theme}</p>
                <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: textSoft }}>{t.themeDesc}</p>
              </div>
            </div>
            {/* Two looks, the landing page's light and dark. */}
            <div role="group" aria-label={t.theme} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {([["dark", DARK_BRIGHTNESS, t.dark], ["light", LIGHT_BRIGHTNESS, t.light]] as const).map(([key, value, label]) => {
                const on = key === "light" ? isLight : !isLight;
                return (
                  <button key={key} type="button" aria-pressed={on}
                    onClick={() => { setBrightness(value); flashSaved(); }}
                    style={{
                      minHeight: "44px", padding: "0 20px", cursor: "pointer",
                      fontSize: "0.9rem", fontWeight: 600,
                      border: "2px solid var(--rule)",
                      background: on ? "var(--lime)" : "var(--card)",
                      color: on ? "#12121a" : "var(--ink)",
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── LANGUAGE ── */}
        <div style={cardStyle}>
          <h2 style={groupHead}>{t.language}</h2>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>{t.languageLabel}</p>
            <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: textSoft }}>{t.languageDesc}</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
              {LANGUAGES.map(l => (
                <button key={l.code} onClick={() => setLang(l.code)} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "0", cursor: "pointer",
                  fontSize: "0.84rem", fontWeight: lang === l.code ? 700 : 500,
                  border: lang === l.code ? "1px solid var(--cobalt-accent)" : `1px solid ${cardBorder}`,
                  background: lang === l.code ? "color-mix(in srgb, var(--cobalt) 16%, transparent)" : isLight ? "color-mix(in srgb, var(--card) 4%, transparent)" : "color-mix(in srgb, var(--ink) 4%, transparent)",
                  color: lang === l.code ? "var(--cobalt-accent)" : textColor,
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

        {/* ── COMING SOON ── */}
        <div style={{ ...cardStyle, opacity: 0.55 }}>
          <h2 style={groupHead}>{t.tba}</h2>
          {[
            { label: t.emailNotif, desc: t.emailNotifDesc },
            { label: t.reportReady, desc: t.reportReadyDesc },
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
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--warn-text)", background: "color-mix(in srgb, var(--warn) 25%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 35%, transparent)", borderRadius: "0", padding: "1px 6px" }}>TBA</span>
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
          Settings apply for this session only — they reset on refresh.
        </p>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--card);border:2px solid var(--cobalt-accent);box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;transition:transform .15s,box-shadow .15s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.15);box-shadow:0 3px 12px color-mix(in srgb, var(--cobalt) 35%, transparent)}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--card);border:2px solid var(--cobalt-accent);box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer}
      `}</style>
    </div>
  );
}

function Toggle({ active, onToggle, disabled = false }: { active: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div onClick={disabled ? undefined : onToggle} style={{
      width: "42px", height: "24px", borderRadius: "0",
      border: `1px solid ${active ? "var(--cobalt-accent)" : "var(--line)"}`,
      background: active ? "color-mix(in srgb, var(--cobalt) 28%, transparent)" : "color-mix(in srgb, var(--card) 50%, transparent)",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", flexShrink: 0, position: "relative",
      transition: "background 0.2s,border-color 0.2s",
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{
        width: "17px", height: "17px", borderRadius: "50%",
        background: active ? "var(--cobalt)" : "var(--paper-alt)",
        position: "absolute",
        transform: active ? "translateX(21px)" : "translateX(3px)",
        transition: "transform 0.2s,background 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}