// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useSettings } from "@/app/contexts/SettingsContext";

/* ── Tiny waving DIG — same art style as the landing mascot ────────────────── */
function DigWave() {
  return (
    <>
      <style>{`
        /* body gentle bob */
        @keyframes digMBob {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        /* right arm wave — pivots at shoulder (36,38) in SVG coords */
        @keyframes digMArmWave {
          0%,100% { transform: rotate(-20deg); }
          45%     { transform: rotate(18deg); }
        }
        /* left arm subtle sway */
        @keyframes digMArmL {
          0%,100% { transform: rotate(0deg); }
          50%     { transform: rotate(-8deg); }
        }
        /* eye blink */
        @keyframes digMBlink {
          0%,88%,100% { transform: scaleY(1); }
          93%         { transform: scaleY(0.08); }
        }
        .digm-body  { animation: digMBob 1.9s ease-in-out infinite; transform-origin: 50% 85%; }
        .digm-arm-r { transform-origin: 36px 38px; animation: digMArmWave 1.1s ease-in-out infinite; }
        .digm-arm-l { transform-origin: 13px 42px; animation: digMArmL 2s ease-in-out infinite; }
        .digm-eye-l { transform-origin: 19px 21px; animation: digMBlink 4.5s ease-in-out infinite; }
        .digm-eye-r { transform-origin: 29px 21px; animation: digMBlink 4.5s ease-in-out 0.2s infinite; }
      `}</style>

      {/* Same viewBox as the landing mascot: 0 0 54 80 */}
      <svg width="54" height="82" viewBox="0 0 54 82" fill="none" style={{ display:"block", overflow:"visible" }}>

        {/* Shadow */}
        <ellipse cx="25" cy="80" rx="13" ry="2.5" fill="rgba(0,0,0,0.12)" />

        <g className="digm-body">

          {/* Legs */}
          <line x1="20" y1="60" x2="15" y2="70" stroke="#c8a060" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="29" y1="60" x2="34" y2="70" stroke="#c8a060" strokeWidth="3.2" strokeLinecap="round" />

          {/* Body */}
          <ellipse cx="24.5" cy="46" rx="13.5" ry="15" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.5" />

          {/* Left arm — hangs at side, holds magnifying glass */}
          <g className="digm-arm-l">
            <path d="M12 42 Q7 48 11 54" stroke="#d4a85a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <circle cx="11.5" cy="54" r="2.4" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />
            {/* Magnifying glass */}
            <circle cx="9" cy="60" r="5.5" fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="1.8" />
            <path d="M6.8 57.5 Q8.2 56 9.8 56.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
            <line x1="13.4" y1="64.2" x2="16.5" y2="67.5" stroke="#6366f1" strokeWidth="2.4" strokeLinecap="round" />
          </g>

          {/* Right arm — raised and waving */}
          <g className="digm-arm-r">
            <path d="M36 38 Q44 26 40 14" stroke="#d4a85a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            {/* Hand */}
            <circle cx="40" cy="14" r="2.8" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />
            {/* Fingers */}
            <line x1="38.5" y1="11.5" x2="37"   y2="9"   stroke="#d4a85a" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="40"   y1="11"   x2="40"   y2="8.5" stroke="#d4a85a" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="41.5" y1="11.5" x2="43"   y2="9"   stroke="#d4a85a" strokeWidth="1.4" strokeLinecap="round" />
          </g>

          {/* Ears */}
          <circle cx="10.5" cy="24" r="4.2" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />
          <circle cx="38.5" cy="24" r="4.2" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />

          {/* Head — bald, same as landing mascot */}
          <circle cx="24" cy="23" r="14.5" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.5" />

          {/* Eyes */}
          <g className="digm-eye-l">
            <circle cx="19" cy="21" r="4.4" fill="white" />
            <circle cx="19" cy="21.5" r="2.6" fill="#1a1a2e" />
            <circle cx="20.2" cy="20" r="1.15" fill="white" />
          </g>
          <g className="digm-eye-r">
            <circle cx="29" cy="21" r="4.4" fill="white" />
            <circle cx="29" cy="21.5" r="2.6" fill="#1a1a2e" />
            <circle cx="30.2" cy="20" r="1.15" fill="white" />
          </g>

          {/* Cheeks */}
          <circle cx="13.5" cy="26" r="3.4" fill="#f9a8d4" opacity="0.38" />
          <circle cx="34.5" cy="26" r="3.4" fill="#f9a8d4" opacity="0.38" />

          {/* Glasses — indigo, same as landing mascot */}
          <rect x="12.2" y="15.5" width="11"  height="9.5" rx="4.8" fill="none" stroke="#6366f1" strokeWidth="1.45" />
          <rect x="24.4" y="15.5" width="11"  height="9.5" rx="4.8" fill="none" stroke="#6366f1" strokeWidth="1.45" />
          <line x1="23.2" y1="20" x2="24.4" y2="20"  stroke="#6366f1" strokeWidth="1.45" />
          <line x1="12.2" y1="20" x2="9.2"  y2="19.5" stroke="#6366f1" strokeWidth="1.2" />
          <line x1="35.4" y1="20" x2="38.4" y2="19.5" stroke="#6366f1" strokeWidth="1.2" />

          {/* Smile */}
          <path d="M19 29 Q24 32.5 29 29" fill="none" stroke="#d4a85a" strokeWidth="1.35" strokeLinecap="round" />

        </g>
      </svg>
    </>
  );
}

const T = {
  en: {
    helpCenter: "Help Center",
    helpHint: "Click a topic below for a step-by-step guide.",
    contactSupport: "Contact Support",
    contactHint: "We typically reply within 1–2 business days.",
    stillNeedHelp: "Still need help?",
    channelHeader: "Channel",
    responseHeader: "Response time",
    channels: [
      { name: "✉ Email",          time: "1–2 business days" },
      { name: "💬 Live chat",      time: "Coming soon" },
      { name: "🐛 GitHub Issues",  time: "Within 48 hours" },
    ],
    docs: [
      {
        id: "upload",
        title: "How to Upload a Dataset",
        icon: "⬆",
        summary: "Upload a CSV file to get started with DIG analysis.",
        steps: [
          "Drag and drop your .csv file onto the Upload card, or click to browse your files.",
          "DIG supports files up to 50 MB. The file must be a valid comma-separated CSV.",
          "Once uploaded, DIG instantly shows a preview of the first 10 rows and 10 columns.",
          "Stats are calculated client-side: row count, column count, and missing value count.",
          "Upload time is captured the moment the file lands — this is stored server-side on upload, so it persists when you sign in later.",
        ],
      },
      {
        id: "run",
        title: "Running the Analysis Model",
        icon: "▶",
        summary: "Use the Analysis Assistant to clean your data and generate AI insights.",
        steps: [
          "After uploading a dataset, locate the Analysis Assistant card beside the upload.",
          "Press the bold Start button to begin the full analysis pipeline.",
          "The assistant will scan for data quality issues and prompt you with yes/no questions.",
          "Use Yes to approve a step, No to skip it, or Cancel to stop the pipeline entirely.",
          "Once all steps complete, a 'Report Ready' banner appears — click it to jump to your report.",
        ],
      },
      {
        id: "chatbot",
        title: "Using the Chatbot",
        icon: "💬",
        summary: "Ask natural language questions about your data during analysis.",
        steps: [
          "The chat input is active during the Analysis phase only (after pressing Start).",
          "Type any question about your data and press Enter or the Send button.",
          "Examples: 'What columns have the most missing values?' or 'Summarise outliers in column A'.",
          "Use the Yes / No buttons to respond to prompts from the assistant instead of typing.",
          "Chat history is preserved for the current session.",
        ],
      },
      {
        id: "report",
        title: "Downloading Your Report",
        icon: "📄",
        summary: "Your PDF report is a complete AI-generated analysis document.",
        steps: [
          "Once analysis completes, navigate to the Report & Exports section.",
          "Click Download PDF Report to save the full analysis document.",
          "You can also download the cleaned CSV, view the report online, or email it to yourself.",
          "The PDF includes: data overview, quality analysis, statistical insights, AI commentary, cleaning log, and all visualisations.",
          "Each dataset generates its own report — re-run analysis on a new upload to get a fresh report.",
        ],
      },
    ],
  },
  fr: {
    helpCenter: "Centre d'aide",
    helpHint: "Cliquez sur un sujet ci-dessous pour un guide étape par étape.",
    contactSupport: "Contacter le support",
    contactHint: "Nous répondons généralement dans 1 à 2 jours ouvrables.",
    stillNeedHelp: "Besoin d'aide supplémentaire ?",
    channelHeader: "Canal",
    responseHeader: "Délai de réponse",
    channels: [
      { name: "✉ E-mail",          time: "1–2 jours ouvrables" },
      { name: "💬 Chat en direct",  time: "Bientôt disponible" },
      { name: "🐛 Issues GitHub",   time: "Sous 48 heures" },
    ],
    docs: [
      {
        id: "upload",
        title: "Comment importer un jeu de données",
        icon: "⬆",
        summary: "Importez un fichier CSV pour démarrer l'analyse DIG.",
        steps: [
          "Glissez-déposez votre fichier .csv sur la carte Upload, ou cliquez pour parcourir vos fichiers.",
          "DIG prend en charge les fichiers jusqu'à 50 Mo. Le fichier doit être un CSV valide séparé par des virgules.",
          "Une fois importé, DIG affiche instantanément un aperçu des 10 premières lignes et colonnes.",
          "Les statistiques sont calculées côté client : nombre de lignes, colonnes et valeurs manquantes.",
          "L'heure d'importation est capturée dès que le fichier arrive — stockée côté serveur, elle persiste à la connexion suivante.",
        ],
      },
      {
        id: "run",
        title: "Lancer le modèle d'analyse",
        icon: "▶",
        summary: "Utilisez l'assistant d'analyse pour nettoyer vos données et générer des insights IA.",
        steps: [
          "Après l'import, localisez la carte Assistant d'analyse à côté de l'upload.",
          "Appuyez sur le bouton Démarrer pour lancer le pipeline complet.",
          "L'assistant scanne les problèmes de qualité et vous pose des questions oui/non.",
          "Utilisez Oui pour approuver une étape, Non pour la passer, ou Annuler pour arrêter le pipeline.",
          "Une fois toutes les étapes terminées, une bannière « Rapport prêt » apparaît — cliquez pour accéder à votre rapport.",
        ],
      },
      {
        id: "chatbot",
        title: "Utiliser le chatbot",
        icon: "💬",
        summary: "Posez des questions en langage naturel sur vos données pendant l'analyse.",
        steps: [
          "La saisie du chat est active uniquement pendant la phase d'analyse (après avoir appuyé sur Démarrer).",
          "Tapez n'importe quelle question sur vos données et appuyez sur Entrée ou le bouton Envoyer.",
          "Exemples : « Quelles colonnes ont le plus de valeurs manquantes ? » ou « Résumez les valeurs aberrantes dans la colonne A ».",
          "Utilisez les boutons Oui / Non pour répondre aux invites de l'assistant.",
          "L'historique du chat est conservé pour la session en cours.",
        ],
      },
      {
        id: "report",
        title: "Télécharger votre rapport",
        icon: "📄",
        summary: "Votre rapport PDF est un document d'analyse complet généré par l'IA.",
        steps: [
          "Une fois l'analyse terminée, accédez à la section Rapport & Exports.",
          "Cliquez sur Télécharger le rapport PDF pour enregistrer le document complet.",
          "Vous pouvez aussi télécharger le CSV nettoyé, consulter le rapport en ligne ou vous l'envoyer par e-mail.",
          "Le PDF inclut : aperçu des données, analyse qualité, insights statistiques, commentaires IA, journal de nettoyage et toutes les visualisations.",
          "Chaque jeu de données génère son propre rapport — relancez l'analyse sur un nouvel import pour obtenir un nouveau rapport.",
        ],
      },
    ],
  },
  fa: {
    helpCenter: "مرکز راهنما",
    helpHint: "روی یک موضوع در زیر کلیک کنید تا راهنمای گام‌به‌گام را ببینید.",
    contactSupport: "تماس با پشتیبانی",
    contactHint: "معمولاً ظرف ۱ تا ۲ روز کاری پاسخ می‌دهیم.",
    stillNeedHelp: "هنوز به کمک نیاز دارید؟",
    channelHeader: "کانال",
    responseHeader: "زمان پاسخ",
    channels: [
      { name: "✉ ایمیل",           time: "۱ تا ۲ روز کاری" },
      { name: "💬 چت زنده",         time: "به زودی" },
      { name: "🐛 GitHub Issues",   time: "ظرف ۴۸ ساعت" },
    ],
    docs: [
      {
        id: "upload",
        title: "نحوه بارگذاری مجموعه داده",
        icon: "⬆",
        summary: "یک فایل CSV بارگذاری کنید تا تحلیل DIG آغاز شود.",
        steps: [
          "فایل .csv خود را روی کارت بارگذاری بکشید و رها کنید، یا برای مرور فایل‌ها کلیک کنید.",
          "DIG از فایل‌های تا ۵۰ مگابایت پشتیبانی می‌کند. فایل باید یک CSV معتبر با جداکننده کاما باشد.",
          "پس از بارگذاری، DIG فوراً پیش‌نمایشی از ۱۰ ردیف و ۱۰ ستون اول نمایش می‌دهد.",
          "آمار در سمت کاربر محاسبه می‌شود: تعداد ردیف‌ها، ستون‌ها و مقادیر گمشده.",
          "زمان بارگذاری در لحظه دریافت فایل ثبت می‌شود و در ورودهای بعدی نیز حفظ می‌ماند.",
        ],
      },
      {
        id: "run",
        title: "اجرای مدل تحلیل",
        icon: "▶",
        summary: "از دستیار تحلیل برای پاک‌سازی داده‌ها و تولید بینش‌های هوش مصنوعی استفاده کنید.",
        steps: [
          "پس از بارگذاری، کارت دستیار تحلیل را در کنار کارت بارگذاری پیدا کنید.",
          "دکمه شروع را فشار دهید تا خط لوله کامل تحلیل آغاز شود.",
          "دستیار مشکلات کیفیت داده را اسکن کرده و سؤالات بله/خیر می‌پرسد.",
          "از بله برای تأیید یک مرحله، خیر برای رد کردن آن، یا لغو برای توقف کامل خط لوله استفاده کنید.",
          "پس از تکمیل همه مراحل، بنری با عنوان «گزارش آماده» ظاهر می‌شود — برای رفتن به گزارش کلیک کنید.",
        ],
      },
      {
        id: "chatbot",
        title: "استفاده از چت‌بات",
        icon: "💬",
        summary: "در حین تحلیل، سؤالات زبان طبیعی درباره داده‌هایتان بپرسید.",
        steps: [
          "ورودی چت تنها در مرحله تحلیل فعال است (پس از فشردن شروع).",
          "هر سؤالی درباره داده‌هایتان تایپ کنید و Enter یا دکمه ارسال را بفشارید.",
          "مثال‌ها: «کدام ستون‌ها بیشترین مقدار گمشده را دارند؟» یا «مقادیر پرت ستون A را خلاصه کن».",
          "از دکمه‌های بله / خیر برای پاسخ به درخواست‌های دستیار استفاده کنید.",
          "تاریخچه چت برای جلسه جاری حفظ می‌شود.",
        ],
      },
      {
        id: "report",
        title: "دانلود گزارش",
        icon: "📄",
        summary: "گزارش PDF شما یک سند تحلیلی کامل تولیدشده توسط هوش مصنوعی است.",
        steps: [
          "پس از تکمیل تحلیل، به بخش گزارش و خروجی‌ها بروید.",
          "روی دانلود گزارش PDF کلیک کنید تا سند کامل ذخیره شود.",
          "همچنین می‌توانید CSV پاک‌شده را دانلود کنید، گزارش را آنلاین مشاهده کنید یا برای خودتان ایمیل کنید.",
          "گزارش PDF شامل: مرور داده، تحلیل کیفیت، بینش‌های آماری، تفسیر هوش مصنوعی، گزارش پاک‌سازی و تمام تصویرسازی‌هاست.",
          "هر مجموعه داده گزارش مختص خود را تولید می‌کند — برای گزارش جدید، تحلیل را مجدداً اجرا کنید.",
        ],
      },
    ],
  },
};

function DocModal({ doc, onClose, stillNeedHelp }) {
  if (!doc) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      {/* Outer wrapper — holds DIG above the modal without clipping */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "540px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* DIG peeking from top-right corner above the modal */}
        <div style={{
          position: "absolute",
          top: "-76px",
          right: "14px",
          zIndex: 10,
          pointerEvents: "none",
          filter: "drop-shadow(0 4px 14px rgba(37,99,235,0.4))",
        }}>
          <DigWave />
        </div>

        {/* Actual modal card */}
        <div style={{
          background: "#020617",
          border: "1px solid rgba(31,41,55,0.9)",
          borderRadius: "18px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}>
        {/* Modal header */}
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(37,99,235,0.12)",
              border: "1px solid rgba(37,99,235,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              flexShrink: 0,
            }}
          >
            {doc.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#e5e7eb" }}>{doc.title}</h3>
            <p className="muted-small" style={{ marginTop: "4px", lineHeight: "1.55" }}>{doc.summary}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(15,23,42,0.9)",
              border: "1px solid rgba(55,65,81,0.8)",
              borderRadius: "8px",
              padding: "7px",
              color: "#6b7280",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {doc.steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(31,41,55,0.8)",
              }}
            >
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "rgba(37,99,235,0.15)",
                  border: "1px solid rgba(37,99,235,0.35)",
                  color: "#bfdbfe",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {i + 1}
              </div>
              <p
                className="muted-small"
                style={{ margin: 0, lineHeight: "1.6", color: "#d1d5db" }}
              >
                {step}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid rgba(31,41,55,0.8)", paddingTop: "14px" }}>
          <p className="muted-small">
            {stillNeedHelp}{" "}
            <a href="mailto:support.dig@proton.me" style={{ color: "#93c5fd", textDecoration: "none" }}>
              support.dig@proton.me
            </a>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function InfoCards() {
  const { lang } = useSettings();
  const t = T[lang] || T.en;
  const [activeDoc, setActiveDoc] = useState(null);

  return (
    <>
      {activeDoc && (
        <DocModal
          doc={activeDoc}
          onClose={() => setActiveDoc(null)}
          stillNeedHelp={t.stillNeedHelp}
        />
      )}

      <div className="lower-grid">

        {/* ── Help Center ── */}
        <div className="card info-card">
          <h2>{t.helpCenter}</h2>
          <p className="muted-small" style={{ marginBottom: "14px" }}>
            {t.helpHint}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {t.docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveDoc(doc)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.9)",
                  border: "1px solid rgba(31,41,55,0.9)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#d1d5db",
                  fontSize: "0.82rem",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.45)";
                  e.currentTarget.style.background = "rgba(37,99,235,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(31,41,55,0.9)";
                  e.currentTarget.style.background = "rgba(15,23,42,0.9)";
                }}
              >
                <span style={{ fontSize: "15px" }}>{doc.icon}</span>
                <span style={{ flex: 1, fontWeight: 500 }}>{doc.title}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* ── Contact Support ── */}
        <div className="card info-card" style={{ gridColumn: "2 / span 2" }}>
          <h2>{t.contactSupport}</h2>
          <p className="muted-small" style={{ marginBottom: "14px" }}>
            {t.contactHint}
          </p>

          {/* Email button */}
          <a
            href="mailto:support.dig@proton.me"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 14px",
              background: "rgba(22,163,74,0.1)",
              border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: "10px",
              color: "#bbf7d0",
              textDecoration: "none",
              fontSize: "0.88rem",
              fontWeight: 600,
              marginBottom: "14px",
              transition: "background 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            support.dig@proton.me
          </a>

          {/* Channel table */}
          <table>
            <thead>
              <tr>
                <th>{t.channelHeader}</th>
                <th>{t.responseHeader}</th>
              </tr>
            </thead>
            <tbody>
              {t.channels.map((ch, i) => (
                <tr key={i}>
                  <td>{ch.name}</td>
                  <td>{ch.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
