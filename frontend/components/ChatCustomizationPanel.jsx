// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";
import {
  DEFAULT_SETTINGS, MAX_BRIEF_CHARS, MAX_INSIGHTS, MAX_MUST_MENTION, MAX_QUESTIONS, MIN_INSIGHTS,
  TEXT_LIMITS, applyBrief, directiveCount,
} from "@/lib/reportSettings";

/**
 * ChatCustomizationPanel — Pro-only report customization before analysis starts.
 *
 * Two ways in, one result. The user can describe the report in their own words
 * and the assistant fills the panel in, or set each option by hand, or both.
 * A brief only ever fills the panel: nothing runs until they press Start, so
 * they can check what was understood and change it.
 *
 * Props:
 *   value       settings, or null for the defaults. Held by the dashboard so
 *               that uploading a file after writing a brief doesn't lose it.
 *   onChange    (settings) → void
 *   onUpgrade   () → void   called when a free user clicks upgrade
 *   isPro       boolean
 */

const T = {
  en: {
    lockedTitle: "⚡ Customize your report",
    lockedDesc: "Describe it in your own words, or set language, tone, focus and questions. Word & PowerPoint too. Pro only.",
    upgrade: "Upgrade →",
    toggle: "Customize report",
    directives: (n) => (n === 1 ? "1 directive" : `${n} directives`),
    briefTitle: "Describe the report you want",
    briefPlaceholder: "e.g. Board meeting next week. Focus on churn by region, five bullet points, plain language. Assume Q4 is incomplete, and make a PowerPoint too.",
    briefButton: "Fill in the settings",
    briefBusy: "Reading…",
    briefHint: "This only fills in the settings below. You can check and change them, and nothing runs until you press Start.",
    briefApplied: "Settings updated. Check them below.",
    briefFallback: "The assistant is busy, so your description went into \"Focus on\". You can set the rest by hand.",
    briefNotPossible: "Not possible:",
    briefLimit: "You've used today's descriptions. The settings below still work as usual.",
    briefDown: "The assistant couldn't be reached just now. You can still set everything below.",
    sectionFocus: "What the report is about",
    focus: "Focus on",
    focusPh: 'e.g. "revenue trends vs cost" or "employee retention drivers"',
    focusHint: "All insights will be shaped around this.",
    comparison: "Comparison",
    comparisonPh: 'e.g. "male vs female" or "Q1 vs Q2"',
    comparisonHint: "At least one insight and one chart will compare these groups.",
    assumptions: "Assumptions",
    assumptionsPh: 'e.g. "Q4 is incomplete" or "prices are in CAD"',
    assumptionsHint: "Facts the report should take as given. It will say that they came from you.",
    avoid: "Leave out",
    avoidPh: 'e.g. "the 2020 rows" or "anything about salaries"',
    mustMention: "Must mention",
    mustMentionPh: "e.g. revenue, Q4, outliers",
    mustMentionMore: "Add more…",
    mustMentionHint: "Topics or column names the report must address. Press Enter to add.",
    add: "add",
    questions: "Questions to answer",
    questionsHint: (n) => `Up to ${n}. The report answers each one, or says why the data can't.`,
    questionPh: "e.g. Which region churns the most?",
    notePh: "Optional note, e.g. who is asking or why it matters",
    addQuestion: "+ Add a question",
    remove: "Remove",
    sectionVoice: "Voice & audience",
    audience: "Audience",
    audiences: { general: "General", executive: "Executive / C-suite", technical: "Technical / data team", client: "Client / external", student: "Student / educational" },
    tone: "Tone",
    tones: { professional: "Professional", technical: "Technical / statistical", storytelling: "Storytelling / narrative", casual: "Casual / friendly", academic: "Academic / research", simplified: "Simplified / plain language" },
    language: "Language",
    languages: { en: "English", fr: "French", es: "Spanish", de: "German", zh: "Chinese", ar: "Arabic", pt: "Portuguese", fa: "Persian" },
    writing: "Writing format",
    writings: { narrative: "Paragraphs", bullets: "Bullet points", mixed: "Mix of both" },
    sectionDepth: "Depth & scope",
    depth: "Report depth",
    depths: { quick: "Quick: short, up to 3 charts, no methodology", standard: "Standard: a paragraph per insight", deep: "Deep dive: two paragraphs per insight, full methodology" },
    insights: "Insights",
    occasion: "Occasion",
    occasions: { general: "General report", investor: "Investor / pitch", academic: "Academic / research", internal: "Internal team review", client: "Client deliverable" },
    sectionCharts: "Chart style",
    charts: "Preferred chart types",
    chartStyles: { mixed: "Mixed: variety across chart types", "bar-heavy": "Bar-heavy: bar and grouped bar", trend: "Trend: line charts and time series", distribution: "Distribution: histograms, box plots, scatter", comparison: "Comparison: side-by-side groups" },
    sectionInclude: "Include in report",
    methodology: "📊 Methodology",
    confidence: "🎯 Confidence score",
    sectionOutput: "Output formats",
    word: "📝 Word (.docx)",
    pptx: "📊 PowerPoint",
    outputHint: "PDF is always included. Word and PowerPoint are additional Pro exports.",
    summary: (o, t) => `${t.languages[o.language]} · ${t.tones[o.tone]} · ${t.audiences[o.audience]} · ${t.writings[o.writingFormat]} · ${o.insightsCount} insights`,
  },
  fr: {
    lockedTitle: "⚡ Personnalisez votre rapport",
    lockedDesc: "Décrivez-le avec vos mots, ou réglez langue, ton, thème et questions. Word et PowerPoint aussi. Pro uniquement.",
    upgrade: "Passer à Pro →",
    toggle: "Personnaliser le rapport",
    directives: (n) => (n === 1 ? "1 consigne" : `${n} consignes`),
    briefTitle: "Décrivez le rapport souhaité",
    briefPlaceholder: "ex. Réunion du conseil la semaine prochaine. Concentrez-vous sur l'attrition par région, cinq points, langage simple. Considérez le T4 comme incomplet, et faites aussi un PowerPoint.",
    briefButton: "Remplir les réglages",
    briefBusy: "Lecture…",
    briefHint: "Cela remplit seulement les réglages ci-dessous. Vous pouvez les vérifier et les changer, et rien ne démarre avant d'appuyer sur Démarrer.",
    briefApplied: "Réglages mis à jour. Vérifiez-les ci-dessous.",
    briefFallback: "L'assistant est occupé : votre description a été placée dans « Se concentrer sur ». Réglez le reste à la main.",
    briefNotPossible: "Impossible :",
    briefLimit: "Vous avez utilisé vos descriptions du jour. Les réglages ci-dessous fonctionnent toujours.",
    briefDown: "L'assistant est injoignable pour le moment. Vous pouvez tout régler ci-dessous.",
    sectionFocus: "Sujet du rapport",
    focus: "Se concentrer sur",
    focusPh: "ex. « revenus face aux coûts » ou « facteurs de fidélisation »",
    focusHint: "Tous les résultats seront orientés autour de ce sujet.",
    comparison: "Comparaison",
    comparisonPh: "ex. « hommes vs femmes » ou « T1 vs T2 »",
    comparisonHint: "Au moins un résultat et un graphique compareront ces groupes.",
    assumptions: "Hypothèses",
    assumptionsPh: "ex. « le T4 est incomplet » ou « les prix sont en CAD »",
    assumptionsHint: "Des faits à tenir pour acquis. Le rapport précisera qu'ils viennent de vous.",
    avoid: "À écarter",
    avoidPh: "ex. « les lignes de 2020 » ou « tout ce qui touche aux salaires »",
    mustMention: "À mentionner",
    mustMentionPh: "ex. revenus, T4, valeurs aberrantes",
    mustMentionMore: "Ajouter…",
    mustMentionHint: "Sujets ou colonnes que le rapport doit traiter. Appuyez sur Entrée pour ajouter.",
    add: "ajouter",
    questions: "Questions à traiter",
    questionsHint: (n) => `Jusqu'à ${n}. Le rapport répond à chacune, ou explique pourquoi les données ne le permettent pas.`,
    questionPh: "ex. Quelle région perd le plus de clients ?",
    notePh: "Note facultative, ex. qui demande ou pourquoi c'est important",
    addQuestion: "+ Ajouter une question",
    remove: "Retirer",
    sectionVoice: "Style et public",
    audience: "Public",
    audiences: { general: "Général", executive: "Direction", technical: "Technique / équipe data", client: "Client / externe", student: "Étudiant / pédagogique" },
    tone: "Ton",
    tones: { professional: "Professionnel", technical: "Technique / statistique", storytelling: "Narratif", casual: "Décontracté", academic: "Académique / recherche", simplified: "Simplifié" },
    language: "Langue",
    languages: { en: "Anglais", fr: "Français", es: "Espagnol", de: "Allemand", zh: "Chinois", ar: "Arabe", pt: "Portugais", fa: "Persan" },
    writing: "Forme du texte",
    writings: { narrative: "Paragraphes", bullets: "Listes à puces", mixed: "Un mélange des deux" },
    sectionDepth: "Profondeur et portée",
    depth: "Profondeur",
    depths: { quick: "Rapide : court, 3 graphiques maximum, sans méthodologie", standard: "Standard : un paragraphe par résultat", deep: "Approfondi : deux paragraphes par résultat, méthodologie complète" },
    insights: "Résultats",
    occasion: "Occasion",
    occasions: { general: "Rapport général", investor: "Investisseurs", academic: "Académique / recherche", internal: "Revue d'équipe interne", client: "Livrable client" },
    sectionCharts: "Style des graphiques",
    charts: "Types préférés",
    chartStyles: { mixed: "Mixte : variété de graphiques", "bar-heavy": "Barres : barres simples et groupées", trend: "Tendance : courbes et séries temporelles", distribution: "Distribution : histogrammes, boîtes, nuages", comparison: "Comparaison : groupes côte à côte" },
    sectionInclude: "Inclure dans le rapport",
    methodology: "📊 Méthodologie",
    confidence: "🎯 Score de confiance",
    sectionOutput: "Formats de sortie",
    word: "📝 Word (.docx)",
    pptx: "📊 PowerPoint",
    outputHint: "Le PDF est toujours inclus. Word et PowerPoint sont des exports Pro.",
    summary: (o, t) => `${t.languages[o.language]} · ${t.tones[o.tone]} · ${t.audiences[o.audience]} · ${t.writings[o.writingFormat]} · ${o.insightsCount} résultats`,
  },
  fa: {
    lockedTitle: "⚡ گزارش خود را شخصی‌سازی کنید",
    lockedDesc: "آن را با زبان خودتان توصیف کنید، یا زبان، لحن، تمرکز و پرسش‌ها را تنظیم کنید. به‌همراه Word و PowerPoint. فقط در Pro.",
    upgrade: "ارتقا →",
    toggle: "شخصی‌سازی گزارش",
    directives: (n) => `${n} دستور`,
    briefTitle: "گزارشی را که می‌خواهید توصیف کنید",
    briefPlaceholder: "مثلاً جلسه هیئت‌مدیره هفته آینده است. روی ریزش مشتری به تفکیک منطقه تمرکز کن، پنج نکته، زبان ساده. فرض کن فصل چهارم ناقص است و یک PowerPoint هم بساز.",
    briefButton: "پر کردن تنظیمات",
    briefBusy: "در حال خواندن…",
    briefHint: "این کار فقط تنظیمات پایین را پر می‌کند. می‌توانید آن‌ها را بررسی و تغییر دهید و تا «شروع» را نزنید چیزی اجرا نمی‌شود.",
    briefApplied: "تنظیمات به‌روز شد. آن‌ها را در پایین بررسی کنید.",
    briefFallback: "دستیار مشغول است، پس توضیح شما در «تمرکز روی» قرار گرفت. بقیه را می‌توانید دستی تنظیم کنید.",
    briefNotPossible: "ممکن نیست:",
    briefLimit: "توضیح‌های امروز شما تمام شده. تنظیمات پایین همچنان کار می‌کنند.",
    briefDown: "الان به دستیار دسترسی نیست. همچنان می‌توانید همه‌چیز را در پایین تنظیم کنید.",
    sectionFocus: "موضوع گزارش",
    focus: "تمرکز روی",
    focusPh: "مثلاً «روند درآمد در برابر هزینه» یا «عوامل ماندگاری کارکنان»",
    focusHint: "همه یافته‌ها حول همین موضوع شکل می‌گیرند.",
    comparison: "مقایسه",
    comparisonPh: "مثلاً «مردان و زنان» یا «فصل اول و دوم»",
    comparisonHint: "دست‌کم یک یافته و یک نمودار این گروه‌ها را مقایسه می‌کند.",
    assumptions: "فرض‌ها",
    assumptionsPh: "مثلاً «فصل چهارم ناقص است» یا «قیمت‌ها به دلار کانادا هستند»",
    assumptionsHint: "واقعیت‌هایی که گزارش باید بپذیرد. گزارش می‌گوید که این‌ها از طرف شماست.",
    avoid: "کنار بگذار",
    avoidPh: "مثلاً «ردیف‌های ۲۰۲۰» یا «هر چیزی درباره حقوق»",
    mustMention: "حتماً ذکر شود",
    mustMentionPh: "مثلاً درآمد، فصل چهارم، داده‌های پرت",
    mustMentionMore: "افزودن…",
    mustMentionHint: "موضوع‌ها یا ستون‌هایی که گزارش باید به آن‌ها بپردازد. برای افزودن Enter بزنید.",
    add: "افزودن",
    questions: "پرسش‌هایی که باید پاسخ داده شوند",
    questionsHint: (n) => `حداکثر ${n} پرسش. گزارش به هرکدام پاسخ می‌دهد یا می‌گوید چرا داده‌ها جواب نمی‌دهند.`,
    questionPh: "مثلاً کدام منطقه بیشترین ریزش را دارد؟",
    notePh: "یادداشت اختیاری، مثلاً چه کسی می‌پرسد یا چرا مهم است",
    addQuestion: "+ افزودن پرسش",
    remove: "حذف",
    sectionVoice: "لحن و مخاطب",
    audience: "مخاطب",
    audiences: { general: "عمومی", executive: "مدیران ارشد", technical: "فنی / تیم داده", client: "مشتری / بیرونی", student: "دانشجو / آموزشی" },
    tone: "لحن",
    tones: { professional: "حرفه‌ای", technical: "فنی / آماری", storytelling: "روایی", casual: "خودمانی", academic: "دانشگاهی / پژوهشی", simplified: "ساده" },
    language: "زبان",
    languages: { en: "انگلیسی", fr: "فرانسوی", es: "اسپانیایی", de: "آلمانی", zh: "چینی", ar: "عربی", pt: "پرتغالی", fa: "فارسی" },
    writing: "شکل نوشتار",
    writings: { narrative: "پاراگراف", bullets: "فهرست نکته‌ای", mixed: "ترکیبی از هر دو" },
    sectionDepth: "عمق و دامنه",
    depth: "عمق گزارش",
    depths: { quick: "سریع: کوتاه، حداکثر ۳ نمودار، بدون روش‌شناسی", standard: "استاندارد: یک پاراگراف برای هر یافته", deep: "عمیق: دو پاراگراف برای هر یافته، روش‌شناسی کامل" },
    insights: "یافته‌ها",
    occasion: "مناسبت",
    occasions: { general: "گزارش عمومی", investor: "سرمایه‌گذار", academic: "دانشگاهی / پژوهشی", internal: "بازبینی داخلی تیم", client: "تحویل به مشتری" },
    sectionCharts: "سبک نمودار",
    charts: "نوع نمودارهای دلخواه",
    chartStyles: { mixed: "ترکیبی: نمودارهای متنوع", "bar-heavy": "میله‌ای: میله‌ای ساده و گروهی", trend: "روند: خطی و سری زمانی", distribution: "توزیع: هیستوگرام، جعبه‌ای، پراکندگی", comparison: "مقایسه: گروه‌ها کنار هم" },
    sectionInclude: "در گزارش بیاید",
    methodology: "📊 روش‌شناسی",
    confidence: "🎯 امتیاز اطمینان",
    sectionOutput: "فرمت‌های خروجی",
    word: "📝 Word (.docx)",
    pptx: "📊 PowerPoint",
    outputHint: "PDF همیشه هست. Word و PowerPoint خروجی‌های اضافه Pro هستند.",
    summary: (o, t) => `${t.languages[o.language]} · ${t.tones[o.tone]} · ${t.audiences[o.audience]} · ${t.writings[o.writingFormat]} · ${o.insightsCount} یافته`,
  },
};

const FIELD_LABEL = {
  margin: "0 0 5px", fontSize: "0.7rem", color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600,
};
const FIELD_HINT = { margin: "4px 0 0", fontSize: "0.7rem", color: "#64748b" };

const inputStyle = (filled) => ({
  width: "100%", padding: "8px 12px", borderRadius: "7px",
  border: filled ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(30,41,59,0.8)",
  background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
  fontSize: "0.82rem", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
});

// ── Locked banner for free users ──────────────────────────────────────────────
function LockedBanner({ onUpgrade, t }) {
  const router = useRouter();
  return (
    <div style={{
      width: "100%", boxSizing: "border-box",
      padding: "12px 16px", borderRadius: "10px", marginTop: "10px",
      background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.18)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
    }}>
      <div style={{ textAlign: "start" }}>
        <p style={{ margin: "0 0 2px", fontSize: "0.83rem", fontWeight: 600, color: "#fde68a" }}>
          {t.lockedTitle}
        </p>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#d6b35c" }}>
          {t.lockedDesc}
        </p>
      </div>
      <button
        onClick={onUpgrade ?? (() => router.push("/plans"))}
        style={{
          padding: "7px 14px", borderRadius: "8px", border: "none",
          background: "linear-gradient(135deg, #d97706, #b45309)",
          color: "#fff", fontWeight: 700, fontSize: "0.78rem",
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        {t.upgrade}
      </button>
    </div>
  );
}

// ── Shared select ──────────────────────────────────────────────────────────────
function Sel({ label, value, onChange, options, flex = "1 1 140px" }) {
  return (
    <div style={{ flex, minWidth: 0 }}>
      <p style={FIELD_LABEL}>{label}</p>
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "7px 10px", borderRadius: "7px",
          border: "1px solid rgba(30,41,59,0.8)",
          background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
          fontSize: "0.82rem", cursor: "pointer", outline: "none",
        }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

const pairs = (labels) => Object.entries(labels);

// ── Toggle chip ────────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 13px", borderRadius: "7px",
        cursor: disabled ? "default" : "pointer",
        border: active ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(30,41,59,0.7)",
        background: active ? "rgba(37,99,235,0.14)" : "rgba(15,23,42,0.6)",
        color: active ? "#93c5fd" : "#6b7280",
        fontSize: "0.8rem", fontWeight: active ? 600 : 400,
        transition: "all 0.15s",
      }}>
      {label}
    </button>
  );
}

// ── Section divider ────────────────────────────────────────────────────────────
function SectionLabel({ text }) {
  return (
    <p style={{
      margin: "16px 0 8px", fontSize: "0.68rem", color: "#64748b",
      textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
      borderBottom: "1px solid rgba(30,41,59,0.5)", paddingBottom: "4px",
    }}>{text}</p>
  );
}

// ── One text setting ───────────────────────────────────────────────────────────
function TextField({ label, value, onChange, placeholder, hint, limit, multiline = false }) {
  const Field = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={FIELD_LABEL}>{label}</p>
      <Field
        aria-label={label}
        dir={value ? "auto" : undefined}
        value={value}
        maxLength={limit}
        rows={multiline ? 2 : undefined}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle(!!value), resize: multiline ? "vertical" : undefined }}
      />
      {hint && <p style={FIELD_HINT}>{hint}</p>}
    </div>
  );
}

// ── Must-mention tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange, t }) {
  const [input, setInput] = useState("");
  const full = tags.length >= MAX_MUST_MENTION;

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val) && !full) onChange([...tags, val]);
    setInput("");
  };

  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={FIELD_LABEL}>{t.mustMention}</p>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px",
        borderRadius: "7px", border: "1px solid rgba(30,41,59,0.8)",
        background: "rgba(15,23,42,0.9)", minHeight: "38px", alignItems: "center",
      }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "2px 8px", borderRadius: "5px",
            background: "rgba(99,102,241,0.18)", color: "#a5b4fc", fontSize: "0.78rem",
          }}>
            {tag}
            <button
              type="button"
              aria-label={`${t.remove} ${tag}`}
              onClick={() => onChange(tags.filter(x => x !== tag))}
              style={{
                background: "none", border: "none", color: "#6366f1",
                cursor: "pointer", padding: 0, fontSize: "0.9rem", lineHeight: 1,
              }}>×</button>
          </span>
        ))}
        {!full && (
          <input
            aria-label={t.mustMention}
            dir={input ? "auto" : undefined}
            value={input}
            maxLength={60}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            }}
            placeholder={tags.length ? t.mustMentionMore : t.mustMentionPh}
            style={{
              flex: "1 1 120px", background: "none", border: "none", outline: "none",
              color: "#e2e8f0", fontSize: "0.82rem", minWidth: "80px",
            }}
          />
        )}
        {input.trim() && (
          <button type="button" onClick={add} style={{
            padding: "2px 8px", borderRadius: "5px", border: "none",
            background: "rgba(99,102,241,0.25)", color: "#a5b4fc",
            fontSize: "0.75rem", cursor: "pointer",
          }}>{t.add}</button>
        )}
      </div>
      <p style={FIELD_HINT}>{t.mustMentionHint}</p>
    </div>
  );
}

// ── Questions, each with its own optional note ─────────────────────────────────
function QuestionList({ questions, onChange, t }) {
  const update = (index, key, value) =>
    onChange(questions.map((q, i) => (i === index ? { ...q, [key]: value } : q)));

  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={FIELD_LABEL}>{t.questions}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
              <input
                aria-label={`${t.questions} ${i + 1}`}
                dir={q.question ? "auto" : undefined}
                value={q.question}
                maxLength={TEXT_LIMITS.question}
                onChange={e => update(i, "question", e.target.value)}
                placeholder={t.questionPh}
                style={inputStyle(!!q.question)}
              />
              <input
                aria-label={`${t.notePh} ${i + 1}`}
                dir={q.note ? "auto" : undefined}
                value={q.note}
                maxLength={TEXT_LIMITS.note}
                onChange={e => update(i, "note", e.target.value)}
                placeholder={t.notePh}
                style={{ ...inputStyle(false), fontSize: "0.76rem", padding: "6px 12px" }}
              />
            </div>
            <button
              type="button"
              aria-label={`${t.remove} ${i + 1}`}
              onClick={() => onChange(questions.filter((_, x) => x !== i))}
              style={{
                background: "none", border: "none", color: "#64748b", cursor: "pointer",
                fontSize: "1.05rem", lineHeight: 1, padding: "7px 4px",
              }}>×</button>
          </div>
        ))}
      </div>
      {questions.length < MAX_QUESTIONS && (
        <button
          type="button"
          className="chip-btn subtle"
          onClick={() => onChange([...questions, { question: "", note: "" }])}
          style={{ fontSize: "0.76rem", padding: "5px 12px", marginTop: questions.length ? "8px" : 0 }}>
          {t.addQuestion}
        </button>
      )}
      <p style={FIELD_HINT}>{t.questionsHint(MAX_QUESTIONS)}</p>
    </div>
  );
}

// ── The brief: say it in your own words ────────────────────────────────────────
function BriefBox({ opts, onChange, t }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const [text,   setText]   = useState("");
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState("");

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const res = await BackendAPI.chatBrief(token, text.trim(), lang);
      onChange(applyBrief(opts, res.settings));
      setResult(res);
    } catch (err) {
      setError(err?.code === "CHAT_LIMIT" ? t.briefLimit : t.briefDown);
    } finally {
      setBusy(false);
    }
  };

  const filled = result && Object.keys(result.settings ?? {}).length > 0;
  const note = !result ? ""
    : result.source === "fallback" ? t.briefFallback
    : result.summary || (filled ? t.briefApplied : "");

  return (
    <div style={{
      padding: "12px", borderRadius: "10px",
      background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.22)",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: "0.82rem", fontWeight: 600, color: "#bfdbfe" }}>
        {t.briefTitle}
      </p>
      <textarea
        aria-label={t.briefTitle}
        dir={text ? "auto" : undefined}
        rows={3}
        value={text}
        maxLength={MAX_BRIEF_CHARS}
        onChange={e => setText(e.target.value)}
        placeholder={t.briefPlaceholder}
        style={{ ...inputStyle(false), resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="chip-btn subtle"
          disabled={busy || !text.trim()}
          onClick={submit}
          style={{
            fontSize: "0.78rem", padding: "6px 14px", fontWeight: 600,
            opacity: (busy || !text.trim()) ? 0.5 : 1,
            cursor: (busy || !text.trim()) ? "not-allowed" : "pointer",
          }}>
          {busy ? t.briefBusy : t.briefButton}
        </button>
      </div>
      <p style={FIELD_HINT}>{t.briefHint}</p>
      {note && (
        <p role="status" dir="auto" style={{ margin: "8px 0 0", fontSize: "0.78rem", lineHeight: 1.5, color: "#bbf7d0" }}>
          {note}
        </p>
      )}
      {result?.notPossible?.length > 0 && (
        <p dir="auto" style={{ margin: "6px 0 0", fontSize: "0.75rem", lineHeight: 1.5, color: "#fbbf24" }}>
          {t.briefNotPossible} {result.notPossible.join(" · ")}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: "0.76rem", color: "#f97373" }}>{error}</p>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * `value = null` alone infers `null`, which fails the production type check for
 * any caller passing real settings.
 *
 * @param {{
 *   value?: object | null,
 *   onChange?: (settings: any) => void,
 *   onUpgrade?: () => void,
 *   isPro?: boolean,
 * }} props
 */
export default function ChatCustomizationPanel({ value = null, onChange, onUpgrade, isPro = false }) {
  const { lang } = useSettings();
  const t = T[lang] || T.en;
  const opts = value ?? DEFAULT_SETTINGS;
  const [open, setOpen] = useState(value !== null);

  if (!isPro) return <LockedBanner onUpgrade={onUpgrade} t={t} />;

  const set = (key, val) => onChange?.({ ...opts, [key]: val });
  const setFmt = (key, val) => set("outputFormat", { ...opts.outputFormat, [key]: val });

  const directives = directiveCount(opts);

  return (
    <div style={{ marginTop: "10px", width: "100%", textAlign: "start" }}>

      {/* ── Collapse toggle ──────────────────────────────────────────────── */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          padding: "10px 14px", borderRadius: "10px",
          borderWidth: "0 0 0 3px", borderStyle: "solid", borderColor: "rgba(37,99,235,0.5)",
          background: open ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.6)",
          cursor: "pointer",
        }}>
        <span style={{ fontSize: "0.9rem" }}>⚙️</span>
        <span style={{ flex: 1, textAlign: "start", fontSize: "0.85rem", fontWeight: 600, color: "#bfdbfe" }}>
          {t.toggle}
        </span>
        {!open && directives > 0 && (
          <span style={{
            padding: "1px 7px", borderRadius: "10px",
            background: "rgba(251,191,36,0.18)", color: "#fbbf24",
            fontSize: "0.7rem", fontWeight: 700,
          }}>
            {t.directives(directives)}
          </span>
        )}
        <span style={{
          color: "#64748b", fontSize: "0.8rem",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s", display: "inline-block",
        }}>▾</span>
      </button>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {open && (
        <div style={{
          marginTop: "8px", padding: "16px",
          background: "rgba(15,23,42,0.8)",
          border: "1px solid rgba(30,41,59,0.8)", borderRadius: "12px",
        }}>

          <BriefBox opts={opts} onChange={onChange} t={t} />

          {/* ── WHAT THE REPORT IS ABOUT ───────────────────────────────── */}
          <SectionLabel text={t.sectionFocus} />
          <TextField label={t.focus} value={opts.focusOn} onChange={v => set("focusOn", v)}
            placeholder={t.focusPh} hint={t.focusHint} limit={TEXT_LIMITS.focusOn} />
          <TextField label={t.comparison} value={opts.comparisons} onChange={v => set("comparisons", v)}
            placeholder={t.comparisonPh} hint={t.comparisonHint} limit={TEXT_LIMITS.comparisons} />
          <TextField label={t.assumptions} value={opts.assumptions} onChange={v => set("assumptions", v)}
            placeholder={t.assumptionsPh} hint={t.assumptionsHint} limit={TEXT_LIMITS.assumptions} multiline />
          <TextField label={t.avoid} value={opts.avoid} onChange={v => set("avoid", v)}
            placeholder={t.avoidPh} limit={TEXT_LIMITS.avoid} />
          <TagInput tags={opts.mustMention} onChange={v => set("mustMention", v)} t={t} />
          <QuestionList questions={opts.questions} onChange={v => set("questions", v)} t={t} />

          {/* ── VOICE & AUDIENCE ───────────────────────────────────────── */}
          <SectionLabel text={t.sectionVoice} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <Sel label={t.audience} value={opts.audience} onChange={v => set("audience", v)} options={pairs(t.audiences)} />
            <Sel label={t.tone} value={opts.tone} onChange={v => set("tone", v)} options={pairs(t.tones)} />
            <Sel label={t.language} value={opts.language} onChange={v => set("language", v)} options={pairs(t.languages)} />
            <Sel label={t.writing} value={opts.writingFormat} onChange={v => set("writingFormat", v)} options={pairs(t.writings)} />
          </div>

          {/* ── DEPTH & SCOPE ──────────────────────────────────────────── */}
          <SectionLabel text={t.sectionDepth} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <Sel label={t.depth} value={opts.depth} onChange={v => set("depth", v)}
              flex="2 1 240px" options={pairs(t.depths)} />
            <Sel label={t.insights} value={String(opts.insightsCount)}
              onChange={v => set("insightsCount", Number(v))}
              flex="0 1 90px"
              options={Array.from({ length: MAX_INSIGHTS - MIN_INSIGHTS + 1 }, (_, i) => {
                const n = String(i + MIN_INSIGHTS);
                return [n, n];
              })} />
            <Sel label={t.occasion} value={opts.occasion} onChange={v => set("occasion", v)} options={pairs(t.occasions)} />
          </div>

          {/* ── CHARTS ─────────────────────────────────────────────────── */}
          <SectionLabel text={t.sectionCharts} />
          <Sel label={t.charts} value={opts.chartStyle} onChange={v => set("chartStyle", v)}
            flex="100%" options={pairs(t.chartStyles)} />

          {/* ── SECTIONS ───────────────────────────────────────────────── */}
          <SectionLabel text={t.sectionInclude} />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Chip label={t.methodology} active={opts.includeMethodology}
              onClick={() => set("includeMethodology", !opts.includeMethodology)} />
            <Chip label={t.confidence} active={opts.includeConfidence}
              onClick={() => set("includeConfidence", !opts.includeConfidence)} />
          </div>

          {/* ── OUTPUT FORMATS ─────────────────────────────────────────── */}
          <SectionLabel text={t.sectionOutput} />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Chip label="📄 PDF" active disabled />
            <Chip label={t.word} active={opts.outputFormat.word} onClick={() => setFmt("word", !opts.outputFormat.word)} />
            <Chip label={t.pptx} active={opts.outputFormat.pptx} onClick={() => setFmt("pptx", !opts.outputFormat.pptx)} />
          </div>
          <p style={{ ...FIELD_HINT, marginTop: "6px" }}>{t.outputHint}</p>

          <p style={{
            margin: "14px 0 0", padding: "10px 14px", borderRadius: "8px", fontSize: "0.77rem", lineHeight: 1.7,
            color: "#94a3b8", background: "rgba(2,6,23,0.5)", border: "1px solid rgba(30,41,59,0.6)",
          }}>
            {t.summary(opts, t)}
          </p>
        </div>
      )}
    </div>
  );
}
