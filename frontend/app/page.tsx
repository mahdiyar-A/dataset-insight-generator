'use client';

import { useEffect } from 'react';
import { useSettings } from './contexts/SettingsContext';
import DigMascot from '@/components/DigMascot';

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    dir: 'ltr',
    nav: { features: 'Features', security: 'Security', developers: 'Developers', contact: 'Contact' },
    hero: {
      title: 'Your Data Has a Story. We Help You Read It.',
      subtitle: 'Drop in any CSV or Excel file and get back a full AI-powered analysis — visualizations, patterns, anomalies, and a professional PDF report. No coding. No setup. Just an insightful report.',
      login: 'Login', register: 'Register', guest: 'Continue as Guest',
      note: 'No account needed for a one-time report. Create an account to save your results.',
      howTitle: 'How it works?',
      step1: 'Upload your dataset — CSV or Excel, up to 50MB.',
      step2: 'Our AI engine profiles your data, detects patterns, and generates charts.',
      step3: 'Download a clean, professional PDF report in seconds.',
    },
    features: {
      heading: 'Everything you need to understand your data',
      subtitle: 'Built for researchers, analysts, and students who want real insights — not just raw numbers.',
      cards: [
        { title: 'Instant Data Profiling', desc: 'Automatically detects column types, missing values, outliers, and correlations. No configuration required — it just works.' },
        { title: 'AI-Written Insights', desc: 'Goes beyond charts. Our AI writes a plain-English narrative explaining what your data means, what stands out, and what to watch out for.' },
        { title: 'Flexible Access', desc: 'Use it as a guest for a quick one-time report, or create an account to save your results and come back anytime.' },
        { title: 'AI-Guided Analysis Assistant', desc: 'An interactive chatbot walks you through your results — asking the right questions, flagging concerns, and helping you get the most out of your report.' },
        { title: 'Your Results, Always There', desc: 'We save your last session automatically. Come back anytime to download your cleaned dataset, original file, or full PDF report — no need to re-upload.' },
      ],
    },
    security: {
      heading: 'Security',
      body: 'Your data is handled with care at every step — from upload to report delivery.',
      items: [
        'All data is transmitted over HTTPS — encrypted end to end.',
        'Files are processed in isolation and never shared with third parties.',
        'We use Supabase — a trusted, production-grade cloud database used by thousands of teams worldwide.',
        'Authentication is handled via industry-standard JWT tokens with secure password hashing.',
        '50MB file size limit and strict file type validation enforced on every upload.',
        'Data quality warnings are surfaced transparently so you always know how reliable your results are.',
        'Built with security-conscious development practices — input validation, error handling, and safe API design throughout.',
      ],
      note: 'Please do not upload confidential or legally sensitive data.',
    },
    developers: {
      heading: 'Developers',
      body: 'We are a team of undergraduate Computer Science students at the University of Calgary — passionate about building AI-powered tools and active members of the UofC AI Club. This project was built as a showcase of what a small, driven team can create with modern full-stack development.',
      role: 'Project Manager · Full Stack',
    },
    contact: { heading: 'Get in Touch', body: "Have questions or feedback? We'd love to hear from you.", btn: 'Contact us' },
    footer: '© 2025 Dataset Insight Generator',
    switcher: { language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light' },
  },

  fr: {
    dir: 'ltr',
    nav: { features: 'Fonctionnalités', security: 'Sécurité', developers: 'Équipe', contact: 'Contact' },
    hero: {
      title: 'Vos données ont une histoire. Nous vous aidons à la lire.',
      subtitle: "Importez n'importe quel fichier CSV ou Excel et obtenez une analyse complète par IA — visualisations, patterns, anomalies et un rapport PDF professionnel. Sans code. Sans configuration. Juste des insights.",
      login: 'Connexion', register: "S'inscrire", guest: 'Continuer en invité',
      note: 'Aucun compte requis pour un rapport ponctuel. Créez un compte pour sauvegarder vos résultats.',
      howTitle: 'Comment ça marche ?',
      step1: "Importez votre dataset — CSV ou Excel, jusqu'à 50 Mo.",
      step2: 'Notre moteur IA profile vos données, détecte les tendances et génère des graphiques.',
      step3: 'Téléchargez un rapport PDF professionnel en quelques secondes.',
    },
    features: {
      heading: 'Tout ce dont vous avez besoin pour comprendre vos données',
      subtitle: 'Conçu pour les chercheurs, analystes et étudiants qui veulent de vraies insights — pas que des chiffres bruts.',
      cards: [
        { title: 'Profilage instantané', desc: 'Détecte automatiquement les types de colonnes, valeurs manquantes, anomalies et corrélations. Sans configuration.' },
        { title: 'Insights rédigés par IA', desc: "Va au-delà des graphiques. Notre IA rédige un narratif en langage naturel expliquant ce que signifient vos données." },
        { title: 'Accès flexible', desc: "Utilisez-le en invité pour un rapport ponctuel, ou créez un compte pour sauvegarder vos résultats." },
        { title: 'Assistant d\'analyse guidée par IA', desc: 'Un chatbot interactif vous guide à travers vos résultats — pose les bonnes questions et vous aide à tirer le meilleur parti de votre rapport.' },
        { title: 'Vos résultats, toujours disponibles', desc: 'Nous sauvegardons automatiquement votre dernière session. Revenez à tout moment pour télécharger votre dataset, fichier original ou rapport PDF.' },
      ],
    },
    security: {
      heading: 'Sécurité',
      body: 'Vos données sont traitées avec soin à chaque étape — du téléchargement à la livraison du rapport.',
      items: [
        'Toutes les données sont transmises via HTTPS — chiffrées de bout en bout.',
        'Les fichiers sont traités en isolation et jamais partagés avec des tiers.',
        'Nous utilisons Supabase — une base de données cloud de production de confiance.',
        "L'authentification utilise des JWT conformes aux standards industriels avec hachage sécurisé.",
        'Limite de 50 Mo et validation stricte du type de fichier à chaque import.',
        "Les avertissements de qualité des données sont affichés de façon transparente.",
        "Développé avec des pratiques sécurisées — validation des entrées, gestion des erreurs, API sûre.",
      ],
      note: 'Veuillez ne pas importer de données confidentielles ou sensibles.',
    },
    developers: {
      heading: 'Équipe',
      body: "Nous sommes une équipe d'étudiants en informatique à l'Université de Calgary — passionnés par les outils IA et membres actifs du club IA de l'UofC. Ce projet démontre ce qu'une petite équipe motivée peut créer avec le développement full-stack moderne.",
      role: 'Chef de projet · Full Stack',
    },
    contact: { heading: 'Nous contacter', body: 'Des questions ou des retours ? Nous serions ravis de vous entendre.', btn: 'Nous contacter' },
    footer: '© 2025 Dataset Insight Generator',
    switcher: { language: 'Langue', theme: 'Thème', dark: 'Sombre', light: 'Clair' },
  },

  fa: {
    dir: 'rtl',
    nav: { features: 'ویژگی‌ها', security: 'امنیت', developers: 'تیم', contact: 'تماس' },
    hero: {
      title: 'داده‌های شما یک داستان دارند. ما کمک می‌کنیم آن را بخوانید.',
      subtitle: 'هر فایل CSV یا اکسل را آپلود کنید و تحلیل کامل مبتنی بر هوش مصنوعی دریافت کنید — تصویرسازی، الگوها، ناهنجاری‌ها و یک گزارش PDF حرفه‌ای. بدون کدنویسی. بدون راه‌اندازی.',
      login: 'ورود', register: 'ثبت‌نام', guest: 'ادامه به عنوان مهمان',
      note: 'برای یک گزارش یکبار مصرف نیازی به حساب نیست. برای ذخیره نتایج حساب بسازید.',
      howTitle: 'چطور کار می‌کند؟',
      step1: 'دیتاست خود را آپلود کنید — CSV یا اکسل، حداکثر ۵۰ مگابایت.',
      step2: 'موتور هوش مصنوعی ما داده‌هایتان را پروفایل می‌کند، الگوها را شناسایی می‌کند و نمودار می‌سازد.',
      step3: 'یک گزارش PDF حرفه‌ای را در چند ثانیه دانلود کنید.',
    },
    features: {
      heading: 'همه چیزی که برای درک داده‌هایتان نیاز دارید',
      subtitle: 'ساخته شده برای پژوهشگران، تحلیلگران و دانشجویانی که به دنبال بینش واقعی هستند — نه فقط اعداد خام.',
      cards: [
        { title: 'پروفایل‌سازی فوری داده', desc: 'به طور خودکار نوع ستون‌ها، مقادیر گم‌شده، دادها پرت و همبستگی‌ها را شناسایی می‌کند. بدون پیکربندی.' },
        { title: 'بینش‌های نوشته‌شده توسط هوش مصنوعی', desc: 'فراتر از نمودارها. هوش مصنوعی ما یک روایت به زبان ساده می‌نویسد که توضیح می‌دهد داده‌های شما چه معنایی دارند.' },
        { title: 'دسترسی انعطاف‌پذیر', desc: 'به عنوان مهمان برای یک گزارش یکبار مصرف استفاده کنید، یا حساب بسازید تا نتایج خود را ذخیره کنید.' },
        { title: 'دستیار تحلیل هدایت‌شده توسط هوش مصنوعی', desc: 'یک چت‌بات تعاملی شما را در نتایج راهنمایی می‌کند — سؤالات درست می‌پرسد و به شما کمک می‌کند از گزارشتان بهترین استفاده را ببرید.' },
        { title: 'نتایج شما، همیشه در دسترس', desc: 'آخرین جلسه شما را به طور خودکار ذخیره می‌کنیم. هر زمان برگردید تا دیتاست پاک‌شده، فایل اصلی یا گزارش PDF را دانلود کنید.' },
      ],
    },
    security: {
      heading: 'امنیت',
      body: 'داده‌های شما در هر مرحله با دقت مدیریت می‌شوند — از آپلود تا تحویل گزارش.',
      items: [
        'تمام داده‌ها از طریق HTTPS منتقل می‌شوند — رمزگذاری شده از ابتدا تا انتها.',
        'فایل‌ها به صورت مجزا پردازش می‌شوند و هرگز با اشخاص ثالث به اشتراک گذاشته نمی‌شوند.',
        'از Supabase استفاده می‌کنیم — پایگاه داده ابری معتمد و در سطح تولید.',
        'احراز هویت از طریق توکن‌های JWT استاندارد با هش رمز عبور ایمن انجام می‌شود.',
        'محدودیت ۵۰ مگابایت و اعتبارسنجی دقیق نوع فایل در هر آپلود.',
        'هشدارهای کیفیت داده به صورت شفاف نمایش داده می‌شوند.',
        'توسعه‌یافته با روش‌های امنیت‌محور — اعتبارسنجی ورودی، مدیریت خطا، طراحی ایمن API.',
      ],
      note: 'لطفاً داده‌های محرمانه یا حساس قانونی آپلود نکنید.',
    },
    developers: {
      heading: 'تیم توسعه',
      body: 'ما یک تیم از دانشجویان کارشناسی علوم کامپیوتر در دانشگاه کالگاری هستیم — علاقه‌مند به ساخت ابزارهای هوش مصنوعی و اعضای فعال باشگاه هوش مصنوعی UofC.',
      role: 'مدیر پروژه · فول استک',
    },
    contact: { heading: 'تماس با ما', body: 'سؤال یا بازخورد دارید؟ خوشحال می‌شویم بشنویم.', btn: 'تماس با ما' },
    footer: '© ۲۰۲۵ Dataset Insight Generator',
    switcher: { language: 'زبان', theme: 'تم', dark: 'تیره', light: 'روشن' },
  },
} as const;

type Lang = keyof typeof T;

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'fa', label: 'FA', flag: '🇮🇷' },
];

// ── Light theme overrides ─────────────────────────────────────────────────────
const LIGHT: React.CSSProperties = {
  background: 'linear-gradient(160deg, #e8f0fe 0%, #f0f4ff 50%, #eef2ff 100%)',
  color: '#111827',
};

export default function HomePage() {
  // ── Shared session settings (persists across landing ↔ dashboard navigation) ──
  const { lang, setLang, brightness, setBrightness } = useSettings();
  const light = brightness > 65;

  const t = T[lang];
  // RTL is handled globally by SettingsContext — no local useEffect needed

  const isRtl = t.dir === 'rtl';

  // ── Theme tokens derived from light/dark ─────────────────────────────────
  const theme = {
    bg:         light ? '#f0f4ff'              : 'transparent',
    navbar:     light ? 'rgba(255,255,255,0.9)' : 'rgba(5,8,16,0.9)',
    navText:    light ? '#374151'              : '#d1d5db',
    text:       light ? '#111827'              : '#f9fafb',
    textSoft:   light ? '#4b5563'              : '#9ca3af',
    card:       light ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.7)',
    cardBorder: light ? 'rgba(209,213,219,0.8)' : 'rgba(31,41,55,0.8)',
    sectionAlt: light ? '#e8f0fe'              : 'rgba(255,255,255,0.02)',
    link:       light ? '#1d4ed8'              : '#60a5fa',
  };

  return (
    <div
      className="container"
      style={light ? LIGHT : {}}
    >
      {/* ── Navbar ── */}
      <header
        className="navbar"
        style={{ background: theme.navbar, borderBottom: light ? '1px solid rgba(209,213,219,0.6)' : 'none' }}
      >
        <div className="logo" style={{ color: theme.text }}>
          <img src="/DIG.png" alt="DIG Logo" style={{ height: '100px', width: '200px' }} />
          <span>Dataset Insight Generator</span>
        </div>

        {/* Nav links + switcher row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <nav className="nav-links" style={{ display: 'flex', gap: '0' }}>
            {(['features','security','developers','contact'] as const).map(k => (
              <a key={k} href={`#${k}`} style={{ color: theme.navText }}>{t.nav[k]}</a>
            ))}
          </nav>

          {/* ── Language + Theme switcher ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            marginLeft: isRtl ? 0 : '16px', marginRight: isRtl ? '16px' : 0,
            padding: '5px 8px',
            borderRadius: '12px',
            background: light ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.06)',
            border: light ? '1px solid rgba(37,99,235,0.2)' : '1px solid rgba(255,255,255,0.1)',
          }}>
            {/* Lang buttons */}
            {LANGS.map(l => (
              <button key={l.code} onClick={() => setLang(l.code as any)} title={l.label} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '3px 8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '0.72rem', fontWeight: lang === l.code ? 700 : 400,
                background: lang === l.code
                  ? (light ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.14)')
                  : 'transparent',
                color: lang === l.code ? (light ? '#1d4ed8' : '#bfdbfe') : theme.textSoft,
                transition: 'all 0.15s',
              }}>
                <span>{l.flag}</span> <span>{l.label}</span>
              </button>
            ))}

            {/* Divider */}
            <div style={{ width: '1px', height: '16px', background: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            {/* Dark/Light toggle */}
            <button onClick={() => setBrightness(brightness > 65 ? 10 : 80)} title={light ? t.switcher.dark : t.switcher.light} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: theme.textSoft,
              fontSize: '0.72rem', fontWeight: 500,
              transition: 'all 0.15s',
            }}>
              <span>{light ? '☀️' : '🌙'}</span>
              <span>{light ? t.switcher.light : t.switcher.dark}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main>
        <section className="hero">
          <div className="hero-content">
            <h1 style={{ color: theme.text }}>{t.hero.title}</h1>
            <p className="hero-subtitle" style={{ color: theme.textSoft }}>{t.hero.subtitle}</p>
            <div className="hero-buttons">
              <a href="/login"          className="btn primary">{t.hero.login}</a>
              <a href="/register"       className="btn secondary">{t.hero.register}</a>
              <a href="/guestDashboard" className="btn ghost">{t.hero.guest}</a>
            </div>
            <p className="small-note" style={{ color: theme.textSoft }}>{t.hero.note}</p>
          </div>

          <div className="hero-panel">
            <div className="card hero-card" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}>
              <h3>{t.hero.howTitle}</h3>
              <ol style={{ color: theme.textSoft }}>
                <li>{t.hero.step1}</li>
                <li>{t.hero.step2}</li>
                <li>{t.hero.step3}</li>
              </ol>
            </div>
          </div>
        </section>

        {/* ── DIG mascot stage ── */}
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',   /* label on top, DIG track on bottom */
          width: '100%',
          overflow: 'visible',       /* must be visible so tooltip is never clipped */
          zIndex: 5,                 /* sits above hero + features so tooltip always shows */
          background: light
            ? 'linear-gradient(to bottom, #e8f0fe00, #e8f0fe40)'
            : 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.04))',
          borderBottom: light
            ? '1px solid rgba(99,102,241,0.12)'
            : '1px solid rgba(99,102,241,0.08)',
        }}>
          {/* Label row — clearly ABOVE DIG's walking track, no overlap */}
          <div style={{
            width: '100%',
            textAlign: 'right',
            paddingRight: '16px',
            paddingTop: '13px',
            paddingBottom: '10px',
            fontSize: '0.62rem',
            color: light ? 'rgba(99,102,241,0.5)' : 'rgba(148,163,184,0.4)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            userSelect: 'none',
            flexShrink: 0,
          }}>
            {lang === 'fr' ? 'DIG analyse votre dataset…' : lang === 'fa' ? 'DIG در حال بررسی دیتاست شماست…' : 'DIG is searching your dataset…'}
          </div>

          {/* DIG track row — paddingTop compensates for label moving up, keeps DIG in place */}
          <div style={{ position: 'relative', width: '100%', paddingTop: '13px' }}>
            {/* Floor line DIG walks on */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '4px',
              right: '4px',
              height: '1px',
              background: light
                ? 'linear-gradient(to right, transparent, rgba(99,102,241,0.25), transparent)'
                : 'linear-gradient(to right, transparent, rgba(99,102,241,0.18), transparent)',
            }} />
            <DigMascot />
          </div>
        </div>

        {/* ── Features ── */}
        <section id="features" className="section section-light" style={{ background: theme.sectionAlt }}>
          <h2 style={{ color: theme.text }}>{t.features.heading}</h2>
          <p className="section-subtitle" style={{ color: theme.textSoft }}>{t.features.subtitle}</p>
          <div className="card-grid">
            {t.features.cards.map((c, i) => (
              <div key={i} className="card" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
                <h3 style={{ color: theme.text }}>{c.title}</h3>
                <p style={{ color: theme.textSoft }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Security ── */}
        <section id="security" className="section">
          <h2 style={{ color: theme.text }}>{t.security.heading}</h2>
          <div className="card wide-card" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            <p style={{ color: theme.textSoft }}>{t.security.body}</p>
            <ul style={{ color: theme.textSoft }}>
              {t.security.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            <p className="small-note" style={{ color: theme.textSoft }}>{t.security.note}</p>
          </div>
        </section>

        {/* ── Developers ── */}
        <section id="developers" className="section section-light" style={{ background: theme.sectionAlt }}>
          <h2 style={{ color: theme.text }}>{t.developers.heading}</h2>
          <div className="card wide-card" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            <p style={{ color: theme.textSoft }}>{t.developers.body}</p>
            <br />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '16px', marginTop: '8px' }}>
              <div>
                <p style={{ fontWeight: 600, color: theme.text }}>Mahdiyar Ashrafioun</p>
                <p style={{ fontSize: '0.8rem', color: theme.textSoft }}>{t.developers.role}</p>
                <a href="https://www.linkedin.com/in/mahdiyar-ashrafioun/" target="_blank" style={{ fontSize: '0.78rem', color: theme.link }}>LinkedIn →</a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="section">
          <h2 style={{ color: theme.text }}>{t.contact.heading}</h2>
          <div className="card wide-card contact-card" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            <p style={{ color: theme.textSoft }}>{t.contact.body}</p>
            <a href="mailto:dataset_insight_generator.ai@proton.me" className="btn primary">{t.contact.btn}</a>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <p style={{ color: theme.textSoft }}>{t.footer}</p>
      </footer>
    </div>
  );
}
