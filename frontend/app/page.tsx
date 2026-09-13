'use client';

import Link from 'next/link';

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

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'fa', label: 'FA' },
];

// ── Atlas palette ─────────────────────────────────────────────────────────────
// Cobalt is the voice; chartreuse is reserved for a single accent per screen.
// The dark variant is a restatement rather than an inversion — cobalt is lifted
// so it still reads as a colour against ink, and the paper tone becomes the text.
// `cobalt` is a SURFACE that carries white text, so it stays deep in both
// themes — white on the lifted indigo lands near 2.9:1, well under the 4.5:1
// minimum. `cobaltAccent` is the same hue as TEXT on the page ground, and there
// the relationship inverts: the deep cobalt reads at 2.3:1 against dark paper,
// so the dark theme lifts it. One hue, two jobs, two values.
const ATLAS = {
  light: {
    paper: '#f2efe9', paperAlt: '#e9e5dd', ink: '#12121a',
    // inkFaint is darker than it looks like it needs to be: the eyebrow
    // labels use it at 11.5px over the tinted section ground, where the
    // original #6b6862 measured 4.42:1 — just under the 4.5 minimum.
    inkSoft: '#4a4741', inkFaint: '#66635d',
    rule: '#12121a', hairline: 'rgba(18,18,26,0.16)',
    cobalt: '#2536e0', cobaltAccent: '#2536e0',
    lime: '#d6f24a', card: '#ffffff',
  },
  dark: {
    paper: '#12121a', paperAlt: '#191922', ink: '#f2efe9',
    inkSoft: '#b8b4ac', inkFaint: '#8a8780',
    rule: '#f2efe9', hairline: 'rgba(242,239,233,0.18)',
    cobalt: '#2536e0', cobaltAccent: '#8b95f5',
    lime: '#d6f24a', card: '#1b1b26',
  },
} as const;

const DISPLAY = 'var(--font-display), "Bricolage Grotesque", Georgia, serif';
const SANS = 'var(--font-sans), "Work Sans", system-ui, sans-serif';

export default function HomePage() {
  const { lang, setLang, brightness, setBrightness } = useSettings();
  const light = brightness > 65;
  const c = light ? ATLAS.light : ATLAS.dark;

  const t = T[lang];
  const isRtl = t.dir === 'rtl';

  // Section reveals ride the scroll position via a CSS view timeline. They are
  // declared inside @supports and default to fully visible, because a reveal
  // that fails closed would leave a blank marketing page on a browser without
  // scroll timelines.
  const pageCss = [
    '@keyframes atlas-rise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: none; } }',
    '@supports (animation-timeline: view()) {',
    '  .atlas-rv { animation: atlas-rise linear both; animation-timeline: view(); animation-range: entry 6% cover 24%; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .atlas-rv { animation: none !important; opacity: 1 !important; transform: none !important; }',
    '}',
    '.atlas-link:hover { color: ' + c.cobaltAccent + ' !important; }',
    '.atlas-btn { transition: transform 0.12s ease; }',
    '.atlas-btn:hover { transform: translateY(-1px); }',
    '.atlas-btn:active { transform: translateY(0); }',
    // A finger needs ~44px; the desktop header does not, so this is scoped to
    // coarse pointers rather than applied to every viewport.
    '@media (pointer: coarse) {',
    '  .atlas-tap { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }',
    '}',
  ].join('\n');

  const sectionPad: React.CSSProperties = {
    padding: '76px clamp(16px, 3vw, 32px)',
    borderBottom: '2px solid ' + c.rule,
  };
  const inner: React.CSSProperties = { maxWidth: '1120px', margin: '0 auto' };

  const eyebrow: React.CSSProperties = {
    margin: '0 0 10px', fontSize: '11.5px', fontWeight: 700,
    letterSpacing: '0.2em', color: c.inkFaint,
  };
  const h2: React.CSSProperties = {
    margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(30px, 4vw, 46px)',
    fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.035em', color: c.ink,
  };

  return (
    <div
      dir={t.dir}
      style={{
        background: c.paper, color: c.ink, fontFamily: SANS,
        minHeight: '100vh', overflowX: 'hidden',
      }}
    >
      <style>{pageCss}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: c.paper, borderBottom: '2px solid ' + c.rule,
          padding: '8px clamp(16px, 3vw, 32px)', minHeight: '62px',
          display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap',
        }}
      >
        {/* color is set explicitly: this page styles inline rather than through
            globals.css, so an anchor without one falls back to the user agent's
            default link blue. */}
        <Link
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            textDecoration: 'none', color: c.ink,
          }}
          className="atlas-tap"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/DIG.png" alt="" style={{ height: '34px', width: 'auto' }} />
          <span style={{
            fontFamily: DISPLAY, fontSize: '19px', fontWeight: 800,
            letterSpacing: '-0.04em', color: c.ink,
          }}>
            DIG
          </span>
        </Link>

        <nav style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
          {(['features', 'security', 'developers', 'contact'] as const).map(k => (
            <a
              key={k}
              href={'#' + k}
              className="atlas-link atlas-tap"
              style={{ fontSize: '13.5px', fontWeight: 500, color: c.inkSoft, textDecoration: 'none' }}
            >
              {t.nav[k]}
            </a>
          ))}
        </nav>

        <div style={{
          marginInlineStart: 'auto', display: 'flex', alignItems: 'center',
          gap: '6px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', border: '1.5px solid ' + c.hairline }}>
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className="atlas-tap"
                style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer',
                  fontFamily: SANS, fontSize: '11.5px',
                  fontWeight: lang === l.code ? 700 : 500,
                  background: lang === l.code ? c.ink : 'transparent',
                  color: lang === l.code ? c.paper : c.inkFaint,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setBrightness(brightness > 65 ? 10 : 80)}
            className="atlas-tap"
            style={{
              padding: '5px 11px', cursor: 'pointer', background: 'transparent',
              border: '1.5px solid ' + c.hairline, color: c.inkFaint,
              fontFamily: SANS, fontSize: '11.5px', fontWeight: 500,
            }}
          >
            {light ? t.switcher.light : t.switcher.dark}
          </button>

          <Link
            href="/register"
            className="atlas-btn atlas-tap"
            style={{
              padding: '9px 16px', background: c.ink, color: c.paper,
              border: '2px solid ' + c.ink, textDecoration: 'none',
              fontSize: '12.5px', fontWeight: 600,
            }}
          >
            {t.hero.register}
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section style={{
          background: c.cobalt, color: '#ffffff',
          padding: 'clamp(48px, 7vw, 76px) clamp(16px, 3vw, 32px) 0',
          position: 'relative', overflow: 'hidden',
          borderBottom: '2px solid ' + c.rule,
        }}>
          <svg
            width="560" height="560" viewBox="0 0 100 100" aria-hidden="true"
            style={{
              position: 'absolute', insetInlineEnd: '-130px', top: '-100px',
              opacity: 0.13, pointerEvents: 'none',
            }}
          >
            <circle cx="50" cy="50" r="47" fill="none" stroke="#ffffff" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="33" fill="none" stroke="#ffffff" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="20" fill="none" stroke="#ffffff" strokeWidth="0.6" />
            <path d="M50 3a47 47 0 0 1 40.7 70.5L50 50Z" fill="#d6f24a" opacity="0.9" />
          </svg>

          <div style={{ ...inner, position: 'relative' }}>
            <h1 style={{
              margin: 0, fontFamily: DISPLAY,
              fontSize: 'clamp(36px, 6.4vw, 80px)', fontWeight: 800,
              lineHeight: 0.98, letterSpacing: '-0.045em',
              maxWidth: '18ch', textWrap: 'pretty',
            }}>
              {t.hero.title}
            </h1>

            <p style={{
              margin: '26px 0 0', fontSize: 'clamp(15px, 1.5vw, 18px)',
              lineHeight: 1.55, maxWidth: '58ch', color: 'rgba(255,255,255,0.82)',
            }}>
              {t.hero.subtitle}
            </p>

            <div style={{ display: 'flex', gap: '10px', margin: '32px 0 0', flexWrap: 'wrap' }}>
              <Link href="/guestDashboard" className="atlas-btn" style={{
                padding: '15px 26px', background: c.lime, color: '#12121a',
                border: '2px solid #12121a', textDecoration: 'none',
                fontFamily: DISPLAY, fontSize: '15px', fontWeight: 700,
              }}>
                {t.hero.guest}
              </Link>
              <Link href="/login" className="atlas-btn" style={{
                padding: '15px 26px', background: 'transparent', color: '#ffffff',
                border: '2px solid rgba(255,255,255,0.55)', textDecoration: 'none',
                fontSize: '14px', fontWeight: 600,
              }}>
                {t.hero.login}
              </Link>
            </div>

            <p style={{ margin: '16px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
              {t.hero.note}
            </p>

            {/* How it works, cropped by the fold so the page invites a scroll */}
            <div style={{
              margin: 'clamp(40px, 5vw, 60px) auto -2px', maxWidth: '880px',
              background: c.paper, color: c.ink,
              // Longhands, not `border` plus a `borderBottom` override: React
              // warns that mixing the two leaves a stale edge when the element
              // rerenders, which is exactly what the theme toggle does.
              borderTop: '2px solid ' + c.rule,
              borderInline: '2px solid ' + c.rule,
              padding: '20px clamp(16px, 2.5vw, 26px) 26px',
              boxShadow: '0 -18px 50px rgba(0,0,0,0.2)',
            }}>
              <p style={{
                margin: '0 0 14px', fontFamily: DISPLAY, fontSize: '17px',
                fontWeight: 700, letterSpacing: '-0.02em',
              }}>
                {t.hero.howTitle}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '18px',
              }}>
                {[t.hero.step1, t.hero.step2, t.hero.step3].map((step, i) => (
                  <div key={i}>
                    <p style={{
                      margin: '0 0 6px', fontFamily: DISPLAY, fontSize: '28px',
                      fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em',
                      color: c.cobaltAccent,
                    }}>
                      {'0' + (i + 1)}
                    </p>
                    <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: c.inkSoft }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── DIG mascot ────────────────────────────────────────────────── */}
        <div style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          width: '100%', overflow: 'visible', zIndex: 5,
          background: c.paperAlt, borderBottom: '2px solid ' + c.rule,
        }}>
          <div style={{
            width: '100%', textAlign: isRtl ? 'left' : 'right',
            padding: '13px 16px 10px', fontSize: '10.5px', fontWeight: 700,
            letterSpacing: '0.14em', color: c.inkFaint, userSelect: 'none',
            flexShrink: 0,
          }}>
            {lang === 'fr'
              ? 'DIG ANALYSE VOTRE DATASET…'
              : lang === 'fa'
                ? 'DIG در حال بررسی دیتاست شماست…'
                : 'DIG IS SEARCHING YOUR DATASET…'}
          </div>
          <div style={{ position: 'relative', width: '100%', paddingTop: '13px' }}>
            <div style={{
              position: 'absolute', bottom: 0, left: '4px', right: '4px',
              height: '1px', background: c.hairline,
            }} />
            <DigMascot />
          </div>
        </div>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section id="features" style={sectionPad}>
          <div style={inner}>
            <p className="atlas-rv" style={eyebrow}>{t.nav.features.toUpperCase()}</p>
            <h2 className="atlas-rv" style={{ ...h2, maxWidth: '20ch' }}>{t.features.heading}</h2>
            <p className="atlas-rv" style={{
              margin: '0 0 44px', fontSize: '16px', lineHeight: 1.6,
              color: c.inkSoft, maxWidth: '62ch',
            }}>
              {t.features.subtitle}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '2px', background: c.rule, border: '2px solid ' + c.rule,
            }}>
              {t.features.cards.map((card, i) => (
                <div
                  key={i}
                  className="atlas-rv"
                  style={{ background: c.paper, padding: '26px 22px 30px' }}
                >
                  <p style={{
                    margin: '0 0 16px', fontFamily: DISPLAY, fontSize: '34px',
                    fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em',
                    color: c.cobaltAccent,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <h3 style={{
                    margin: '0 0 8px', fontFamily: DISPLAY, fontSize: '18px',
                    fontWeight: 700, letterSpacing: '-0.02em', color: c.ink,
                  }}>
                    {card.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: c.inkSoft }}>
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Security ──────────────────────────────────────────────────── */}
        <section id="security" style={{ ...sectionPad, background: c.paperAlt }}>
          <div style={{
            ...inner, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px',
          }}>
            <div>
              <p className="atlas-rv" style={eyebrow}>{t.security.heading.toUpperCase()}</p>
              <h2 className="atlas-rv" style={{ ...h2, maxWidth: '16ch' }}>{t.security.heading}</h2>
              <p className="atlas-rv" style={{
                margin: '0 0 16px', fontSize: '16px', lineHeight: 1.6, color: c.inkSoft,
              }}>
                {t.security.body}
              </p>
              <p className="atlas-rv" style={{
                margin: 0, padding: '10px 14px', fontSize: '13px', lineHeight: 1.5,
                color: '#12121a', background: c.lime, border: '2px solid ' + c.rule,
                fontWeight: 600,
              }}>
                {t.security.note}
              </p>
            </div>

            <ul className="atlas-rv" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {t.security.items.map((item, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex', gap: '12px', padding: '12px 0',
                    borderTop: '1px solid ' + c.hairline,
                    borderBottom: i === t.security.items.length - 1
                      ? '1px solid ' + c.hairline
                      : 'none',
                    fontSize: '14px', lineHeight: 1.45, color: c.inkSoft,
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                       style={{ flexShrink: 0, marginTop: '3px' }}>
                    <path d="M20 6 9 17l-5-5" stroke={c.cobaltAccent} strokeWidth="2.6" strokeLinecap="round" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Developers ────────────────────────────────────────────────── */}
        <section id="developers" style={sectionPad}>
          <div style={inner}>
            <p className="atlas-rv" style={eyebrow}>{t.developers.heading.toUpperCase()}</p>
            <h2 className="atlas-rv" style={{ ...h2, maxWidth: '18ch' }}>{t.developers.heading}</h2>
            <p className="atlas-rv" style={{
              margin: '0 0 30px', fontSize: '16px', lineHeight: 1.6,
              color: c.inkSoft, maxWidth: '70ch',
            }}>
              {t.developers.body}
            </p>

            <div className="atlas-rv" style={{
              display: 'inline-block', padding: '20px 24px',
              border: '2px solid ' + c.rule, background: c.card,
              boxShadow: '10px 10px 0 ' + c.cobaltAccent,
            }}>
              <p style={{
                margin: '0 0 3px', fontFamily: DISPLAY, fontSize: '19px',
                fontWeight: 700, letterSpacing: '-0.02em', color: c.ink,
              }}>
                Mahdiyar Ashrafioun
              </p>
              <p style={{ margin: '0 0 10px', fontSize: '13px', color: c.inkFaint }}>
                {t.developers.role}
              </p>
              <a
                href="https://www.linkedin.com/in/mahdiyar-ashrafioun/"
                target="_blank"
                rel="noopener noreferrer"
                className="atlas-link"
                style={{ fontSize: '13px', fontWeight: 600, color: c.cobaltAccent, textDecoration: 'none' }}
              >
                LinkedIn →
              </a>
            </div>
          </div>
        </section>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <section id="contact" style={{
          padding: '72px clamp(16px, 3vw, 32px)',
          background: c.lime, borderBottom: '2px solid ' + c.rule,
        }}>
          <div style={{ ...inner, textAlign: 'center' }}>
            <h2 className="atlas-rv" style={{
              ...h2, color: '#12121a', margin: '0 0 14px',
              fontSize: 'clamp(32px, 4.6vw, 54px)', fontWeight: 800,
            }}>
              {t.contact.heading}
            </h2>
            <p className="atlas-rv" style={{ margin: '0 0 28px', fontSize: '16.5px', color: '#3c3a34' }}>
              {t.contact.body}
            </p>
            <a
              href="mailto:dataset_insight_generator.ai@proton.me"
              className="atlas-btn"
              style={{
                display: 'inline-block', padding: '16px 30px',
                background: '#12121a', color: '#f2efe9',
                border: '2px solid #12121a', textDecoration: 'none',
                fontFamily: DISPLAY, fontSize: '16px', fontWeight: 700,
              }}
            >
              {t.contact.btn}
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        padding: '28px clamp(16px, 3vw, 32px)',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: DISPLAY, fontSize: '16px', fontWeight: 800,
          letterSpacing: '-0.04em', color: c.ink,
        }}>
          DIG
        </span>
        <span style={{ fontSize: '12.5px', color: c.inkFaint }}>{t.footer}</span>
        <span style={{ marginInlineStart: 'auto', fontSize: '12.5px', color: c.inkFaint }}>
          datainsightgen.com
        </span>
      </footer>
    </div>
  );
}
