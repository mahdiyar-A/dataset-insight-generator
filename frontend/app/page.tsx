'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { partitionVisible } from '@/lib/revealOnScroll';
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
// `cobalt` is a SURFACE that carries white text, so it stays deep in both
// themes — white on a lifted indigo lands near 2.9:1, under the 4.5 minimum.
// `cobaltAccent` is the same hue as TEXT on the page ground, where the
// relationship inverts: deep cobalt reads at 2.3:1 against dark paper, so the
// dark theme lifts it. One hue, two jobs, two values.
const ATLAS = {
  light: {
    paper: '#f2efe9', paperAlt: '#e9e5dd', ink: '#12121a',
    // inkFaint is darker than it looks like it needs to be: the eyebrow labels
    // use it at 11.5px over the tinted ground, where #6b6862 measured 4.42:1.
    inkSoft: '#4a4741', inkFaint: '#66635d',
    rule: '#12121a', hairline: 'rgba(18,18,26,0.16)',
    cobalt: '#2536e0', cobaltAccent: '#2536e0',
    lime: '#d6f24a', card: '#ffffff',
  },
  // Ink-blue rather than near-black. A true black ground under a cobalt hero
  // reads as an absence — the page looked like it had holes in it. These carry
  // the same hue family as the accent, so the dark theme is a dim version of
  // the palette instead of a different, colourless one.
  dark: {
    paper: '#151a2b', paperAlt: '#1b2138', ink: '#f2efe9',
    inkSoft: '#bcc2d4', inkFaint: '#8e96ad',
    rule: '#f2efe9', hairline: 'rgba(242,239,233,0.18)',
    cobalt: '#2536e0', cobaltAccent: '#8b95f5',
    lime: '#d6f24a', card: '#1e2440',
  },
} as const;

// The paper sheet that overlaps the hero is cream in BOTH themes. Letting it
// follow the dark theme turned it into a black slab sitting on the cobalt
// field — the palette's whole point is paper against blue against citron.
const SHEET = { bg: '#f2efe9', ink: '#12121a', soft: '#4a4741', accent: '#2536e0' };

const DISPLAY = 'var(--font-display), "Bricolage Grotesque", Georgia, serif';
const SANS = 'var(--font-sans), "Work Sans", system-ui, sans-serif';

export default function HomePage() {
  const { lang, setLang, brightness, setBrightness } = useSettings();
  const light = brightness > 65;
  const c = light ? ATLAS.light : ATLAS.dark;

  const t = T[lang];
  const isRtl = t.dir === 'rtl';

  // Reveal on scroll.
  //
  // Two earlier attempts failed for instructive reasons, so the approach here
  // is deliberately dull:
  //
  //   1. A CSS view timeline (`animation-range: entry 6% cover 24%`) mixes two
  //      range names; at a short viewport the range collapsed and every
  //      animation reported playState "finished" while its element sat 900px
  //      below the fold — nothing was ever hidden.
  //   2. IntersectionObserver is the usual answer, but it only reports when the
  //      page is actually being rendered, which makes it untestable in a
  //      headless pane and leaves no way to prove it works.
  //
  // The decision itself lives in lib/revealOnScroll so it can be unit tested;
  // this effect only wires it to scroll events. It is rAF-throttled, unbinds
  // once everything has been shown, and — the part that matters — the hidden
  // state is applied by JS (`rv-armed`), never by the stylesheet. If this
  // effect never runs, nothing is ever hidden, so a JS failure degrades to a
  // plain visible page rather than a blank one.
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Which feature the reader has opened. The first is open by default so the
  // grid never reads as five inert tiles.
  const [openFeature, setOpenFeature] = useState(0);

  /**
   * Nav anchors scroll rather than jump.
   *
   * The browser's own smooth scrolling is both fast and fixed; this is roughly
   * twice as long with a soft ease so a jump across the page reads as travel.
   * The offset clears the sticky header, which would otherwise cover the
   * heading the reader just asked for.
   */
  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    const header = document.querySelector('header');
    const offset = (header?.getBoundingClientRect().height ?? 0) + 8;
    const destination = target.getBoundingClientRect().top + window.scrollY - offset;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, destination);
      return;
    }

    const start = window.scrollY;
    const distance = destination - start;
    if (Math.abs(distance) < 2) return;

    // Scale with distance so a short hop is not artificially slow, but cap it
    // so the far end of the page never feels like a wait.
    const duration = Math.min(1400, Math.max(650, Math.abs(distance) * 0.6));
    const startedAt = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      // easeInOutCubic: leaves and arrives gently, quick through the middle.
      const eased = elapsed < 0.5
        ? 4 * elapsed * elapsed * elapsed
        : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      window.scrollTo(0, start + distance * eased);
      if (elapsed < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const watched = Array.from(root.querySelectorAll<HTMLElement>('[data-rv]'));
    if (!watched.length) return;

    const showAll = () => watched.forEach(el => el.classList.add('rv-in'));

    // Motion is the whole effect; without it, skip arming entirely.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.classList.add('rv-armed');

    let raf = 0;
    let measured = false;
    // Never detached on completion: the list is a standing watch now, because
    // elements have to be able to hide again when they leave.
    const detach = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };

    const pass = () => {
      raf = 0;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // A viewport of zero is usually transient — layout has not settled, or
      // the tab is hidden. Revealing everything here (the first version of
      // this) permanently unhid the page on a momentary zero. Wait for the
      // next scroll or resize instead; the rescue timer below is what handles
      // a viewport that never becomes measurable at all.
      if (!vh) return;
      measured = true;

      // Recomputed from scratch each pass, never latched: an element that
      // leaves the viewport fades back out, so scrolling up and down replays
      // the entrance instead of showing a page that is permanently revealed.
      const { visible, hidden } = partitionVisible(
        watched, el => el.getBoundingClientRect(), vh,
      );
      visible.forEach(el => el.classList.add('rv-in'));
      hidden.forEach(el => el.classList.remove('rv-in'));
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pass); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    // Two frames, so the armed state paints before the first reveal — otherwise
    // whatever is already on screen jumps to visible with no transition.
    const kick = requestAnimationFrame(() => requestAnimationFrame(pass));

    // rAF is paused whenever the page is not being composited, so the first
    // pass cannot depend on it alone: a tab restored from the background, or an
    // embedded view that never composites, would sit on hidden content
    // indefinitely. Timers keep running, and visibilitychange covers the tab
    // coming back.
    const kickTimer = window.setTimeout(pass, 120);
    const onVisible = () => { if (!document.hidden) pass(); };
    document.addEventListener('visibilitychange', onVisible);

    // Last resort: if the viewport never became measurable, show everything
    // rather than leave the reader looking at nothing.
    const rescue = window.setTimeout(() => {
      if (!measured) { showAll(); detach(); }
    }, 3000);

    return () => {
      detach();
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(rescue);
      window.clearTimeout(kickTimer);
      if (raf) cancelAnimationFrame(raf);
      cancelAnimationFrame(kick);
    };
  }, [lang, light]);

  const pageCss = [
    // Longer and gentler than the first pass, which snapped. The curve is
    // heavily eased-out so movement decelerates into place rather than
    // arriving at a constant speed, and `will-change` keeps the transform on
    // its own layer so a long list does not judder.
    '.rv-armed [data-rv] { opacity: 0; transform: translateY(38px); will-change: opacity, transform;',
    // Colour is listed here too. This rule outranks .atlas-feature on
    // specificity, and a `transition` shorthand replaces rather than merges,
    // so a card's fill would otherwise snap on click instead of fading.
    '  transition: opacity 1.05s cubic-bezier(0.16,1,0.3,1), transform 1.05s cubic-bezier(0.16,1,0.3,1),',
    '              background-color 0.25s ease, color 0.25s ease; }',
    '.rv-armed [data-rv].rv-in { opacity: 1; transform: none; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .rv-armed [data-rv] { opacity: 1 !important; transform: none !important; transition: none !important; }',
    '  .atlas-marquee { animation: none !important; }',
    '}',
    '@keyframes atlas-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }',
    '.atlas-marquee { animation: atlas-scroll 26s linear infinite; }',
    '.atlas-link:hover { color: ' + c.cobaltAccent + ' !important; }',
    '.atlas-btn { transition: transform 0.12s ease; }',
    '.atlas-btn:hover { transform: translateY(-1px); }',
    '.atlas-btn:active { transform: translateY(0); }',
    '.atlas-feature { transition: background 0.25s ease, color 0.25s ease; }',
    '.atlas-feature:focus-visible { outline: 3px solid ' + c.lime + '; outline-offset: -3px; }',
    '@media (pointer: coarse) {',
    '  .atlas-tap { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }',
    '}',
  ].join('\n');

  const inner: React.CSSProperties = { maxWidth: '1120px', margin: '0 auto' };
  const sectionPad: React.CSSProperties = {
    padding: '76px clamp(16px, 3vw, 32px)',
    borderBottom: '2px solid ' + c.rule,
  };

  // Staggered delay, capped so a long list never leaves the reader waiting.
  const stagger = (i: number): React.CSSProperties => ({
    transitionDelay: Math.min(i, 5) * 70 + 'ms',
  });

  const eyebrow = (color: string): React.CSSProperties => ({
    margin: '0 0 10px', fontSize: '11.5px', fontWeight: 700,
    letterSpacing: '0.2em', color,
  });
  const h2 = (color: string): React.CSSProperties => ({
    margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(30px, 4vw, 46px)',
    fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.035em', color,
  });

  const marqueeWords = lang === 'fr'
    ? ['CSV EN ENTRÉE', 'ANALYSE EN SORTIE', 'SANS FORMULES', 'RAPPORT PDF', '8 LANGUES']
    : lang === 'fa'
      ? ['ورودی CSV', 'خروجی تحلیل', 'بدون فرمول', 'گزارش PDF', '۸ زبان']
      : ['CSV IN', 'ANALYSIS OUT', 'NO FORMULAS', 'PDF REPORT', '8 LANGUAGES'];

  return (
    <div
      ref={rootRef}
      dir={t.dir}
      style={{
        background: c.paper, color: c.ink, fontFamily: SANS,
        minHeight: '100vh',
        // `clip`, not `hidden`: overflow-x:hidden makes this element a scroll
        // container, and a sticky child resolves against the nearest
        // scrollport — so the header would silently stop sticking. `clip`
        // trims the same overflow without creating one.
        overflowX: 'clip',
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
        {/* color set explicitly: this page styles inline, so an anchor without
            one falls back to the user agent's default link blue. */}
        <Link
          href="/"
          className="atlas-tap"
          style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            textDecoration: 'none', color: c.ink,
          }}
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
              onClick={e => { e.preventDefault(); scrollToSection(k); }}
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
            <h1 data-rv style={{
              margin: 0, fontFamily: DISPLAY,
              fontSize: 'clamp(36px, 6.4vw, 80px)', fontWeight: 800,
              lineHeight: 0.98, letterSpacing: '-0.045em',
              maxWidth: '18ch', textWrap: 'pretty',
            }}>
              {t.hero.title}
            </h1>

            <p data-rv style={{
              ...stagger(1),
              margin: '26px 0 0', fontSize: 'clamp(15px, 1.5vw, 18px)',
              lineHeight: 1.55, maxWidth: '58ch', color: 'rgba(255,255,255,0.82)',
            }}>
              {t.hero.subtitle}
            </p>

            <div data-rv style={{
              ...stagger(2),
              display: 'flex', gap: '10px', margin: '32px 0 0', flexWrap: 'wrap',
            }}>
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

            <p data-rv style={{
              ...stagger(3),
              margin: '16px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.7)',
            }}>
              {t.hero.note}
            </p>

            {/* A sheet of paper laid on the cobalt field — cream in both themes,
                and overlapping the fold so the page invites a scroll. */}
            <div data-rv style={{
              ...stagger(4),
              margin: 'clamp(40px, 5vw, 60px) auto -2px', maxWidth: '880px',
              background: SHEET.bg, color: SHEET.ink,
              borderTop: '2px solid #12121a',
              borderInline: '2px solid #12121a',
              padding: '22px clamp(16px, 2.5vw, 28px) 28px',
              boxShadow: '0 -18px 50px rgba(0,0,0,0.25)',
            }}>
              <p style={{
                margin: '0 0 16px', fontFamily: DISPLAY, fontSize: '17px',
                fontWeight: 700, letterSpacing: '-0.02em',
              }}>
                {t.hero.howTitle}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '20px',
              }}>
                {[t.hero.step1, t.hero.step2, t.hero.step3].map((step, i) => (
                  <div key={i}>
                    <p style={{
                      margin: '0 0 7px', fontFamily: DISPLAY, fontSize: '30px',
                      fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em',
                      color: SHEET.accent,
                    }}>
                      {'0' + (i + 1)}
                    </p>
                    <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: SHEET.soft }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Citron ticker ─────────────────────────────────────────────── */}
        <div style={{
          background: c.lime, borderBlock: '2px solid #12121a',
          overflow: 'hidden', padding: '11px 0',
        }}>
          <div className="atlas-marquee" style={{ display: 'flex', width: 'max-content' }}>
            {[0, 1].map(copy => (
              <div key={copy} aria-hidden={copy === 1} style={{ display: 'flex' }}>
                {marqueeWords.map((w, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '22px',
                    padding: '0 22px', fontFamily: DISPLAY, fontSize: '15px',
                    fontWeight: 700, letterSpacing: '0.02em', color: '#12121a',
                    whiteSpace: 'nowrap',
                  }}>
                    {w}
                    <span aria-hidden="true" style={{
                      width: '7px', height: '7px', background: '#12121a',
                      transform: 'rotate(45deg)', display: 'inline-block',
                    }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

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
            <p data-rv style={eyebrow(c.inkFaint)}>{t.nav.features.toUpperCase()}</p>
            <h2 data-rv style={{ ...h2(c.ink), ...stagger(1), maxWidth: '20ch' }}>
              {t.features.heading}
            </h2>
            <p data-rv style={{
              ...stagger(2),
              margin: '0 0 44px', fontSize: '16px', lineHeight: 1.6,
              color: c.inkSoft, maxWidth: '62ch',
            }}>
              {t.features.subtitle}
            </p>

            {/* Capped at three columns and the last card spans two, so the row
                always fills. With auto-fit and five cards the leftover cell
                showed the grid container's own background — a bare pale block
                sitting in the grid. */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '2px', background: c.rule, border: '2px solid ' + c.rule,
            }}>
              {t.features.cards.map((card, i) => {
                const open = openFeature === i;
                const last = i === t.features.cards.length - 1;
                return (
                  <button
                    key={i}
                    data-rv
                    type="button"
                    aria-pressed={open}
                    onClick={() => setOpenFeature(i)}
                    className="atlas-feature"
                    style={{
                      ...stagger(i),
                      gridColumn: last ? 'span 2' : undefined,
                      background: open ? c.cobalt : c.paper,
                      color: open ? '#ffffff' : c.ink,
                      padding: '26px 22px 30px',
                      border: 'none',
                      textAlign: isRtl ? 'right' : 'left',
                      font: 'inherit',
                      cursor: 'pointer',
                      display: 'block',
                      width: '100%',
                    }}
                  >
                    <span style={{
                      display: 'block',
                      margin: '0 0 16px', fontFamily: DISPLAY, fontSize: '34px',
                      fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em',
                      color: open ? c.lime : c.cobaltAccent,
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{
                      display: 'block',
                      margin: '0 0 8px', fontFamily: DISPLAY, fontSize: '18px',
                      fontWeight: 700, letterSpacing: '-0.02em',
                      color: open ? '#ffffff' : c.ink,
                    }}>
                      {card.title}
                    </span>
                    <span style={{
                      display: 'block',
                      fontSize: '14px', lineHeight: 1.55,
                      color: open ? 'rgba(255,255,255,0.88)' : c.inkSoft,
                    }}>
                      {card.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Security — the second blue block, so the page reads
             blue / paper / blue / citron rather than one accent and filler ── */}
        <section id="security" style={{
          padding: '76px clamp(16px, 3vw, 32px)',
          background: c.cobalt, color: '#ffffff',
          borderBottom: '2px solid ' + c.rule,
        }}>
          <div style={{
            ...inner, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px',
          }}>
            <div>
              <p data-rv style={eyebrow('#d6f24a')}>{t.security.heading.toUpperCase()}</p>
              <h2 data-rv style={{ ...h2('#ffffff'), ...stagger(1), maxWidth: '16ch' }}>
                {t.security.heading}
              </h2>
              <p data-rv style={{
                ...stagger(2),
                margin: '0 0 18px', fontSize: '16px', lineHeight: 1.6,
                color: 'rgba(255,255,255,0.82)',
              }}>
                {t.security.body}
              </p>
              <p data-rv style={{
                ...stagger(3),
                margin: 0, padding: '11px 15px', fontSize: '13px', lineHeight: 1.5,
                color: '#12121a', background: c.lime, border: '2px solid #12121a',
                fontWeight: 600,
              }}>
                {t.security.note}
              </p>
            </div>

            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {t.security.items.map((item, i) => (
                <li
                  key={i}
                  data-rv
                  style={{
                    ...stagger(i),
                    display: 'flex', gap: '12px', padding: '12px 0',
                    borderTop: '1px solid rgba(255,255,255,0.28)',
                    borderBottom: i === t.security.items.length - 1
                      ? '1px solid rgba(255,255,255,0.28)'
                      : 'none',
                    fontSize: '14px', lineHeight: 1.45,
                    color: 'rgba(255,255,255,0.88)',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                       style={{ flexShrink: 0, marginTop: '3px' }}>
                    <path d="M20 6 9 17l-5-5" stroke="#d6f24a" strokeWidth="2.8" strokeLinecap="round" />
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
            <p data-rv style={eyebrow(c.inkFaint)}>{t.developers.heading.toUpperCase()}</p>
            <h2 data-rv style={{ ...h2(c.ink), ...stagger(1), maxWidth: '18ch' }}>
              {t.developers.heading}
            </h2>
            <p data-rv style={{
              ...stagger(2),
              margin: '0 0 30px', fontSize: '16px', lineHeight: 1.6,
              color: c.inkSoft, maxWidth: '70ch',
            }}>
              {t.developers.body}
            </p>

            <div data-rv style={{
              ...stagger(3),
              display: 'inline-block', padding: '22px 26px',
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
          background: c.lime, borderBottom: '2px solid #12121a',
        }}>
          <div style={{ ...inner, textAlign: 'center' }}>
            <h2 data-rv style={{
              ...h2('#12121a'), margin: '0 0 14px',
              fontSize: 'clamp(32px, 4.6vw, 54px)', fontWeight: 800,
            }}>
              {t.contact.heading}
            </h2>
            <p data-rv style={{
              ...stagger(1),
              margin: '0 0 28px', fontSize: '16.5px', color: '#3c3a34',
            }}>
              {t.contact.body}
            </p>
            <a
              data-rv
              href="mailto:dataset_insight_generator.ai@proton.me"
              className="atlas-btn"
              style={{
                ...stagger(2),
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
