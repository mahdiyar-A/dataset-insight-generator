'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { partitionVisible } from '@/lib/revealOnScroll';
import { useSettings } from './contexts/SettingsContext';
import DigMascot from '@/components/DigMascot';
import { MoonIcon, PlayIcon, SunIcon } from '@/components/Icons';
import { ATLAS, DISPLAY, SANS } from './home/atlas';
import ClosingSection from './home/ClosingSection';
import FaqSection from './home/FaqSection';
import FilesSection from './home/FilesSection';
import HeroShot from './home/HeroShot';
import { HOME_CSS } from './home/homeStyles';
import PricingSection from './home/PricingSection';
import ProofSection from './home/ProofSection';
import SecuritySection from './home/SecuritySection';
import SiteFooter from './home/SiteFooter';

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    dir: 'ltr',
    nav: { features: 'Features', security: 'Security', pricing: 'Pricing', faq: 'FAQ', contact: 'Contact', menu: 'Menu' },
    hero: {
      title: 'Your Data Has a Story. We Help You Read It.',
      subtitle: 'Drop in a CSV, Excel, JSON, Parquet or SPSS file and get back a full AI-powered analysis — visualizations, patterns, anomalies, and a professional PDF report. No coding. No setup. Just an insightful report.',
      login: 'Login', register: 'Register', demo: 'Try the interactive demo',
      note: 'See everything DIG does in the demo first. A free account runs it on your own data and keeps your results.',
    },
    features: {
      heading: 'An analyst’s work, done for you.',
      subtitle: 'For business owners, analysts, researchers and students who want answers, not raw numbers.',
      cards: [
        { title: 'Cleans the mess first', desc: 'Spots blank cells, repeated rows and impossible values, cleans them up, and shows you exactly what changed.' },
        { title: 'Findings that show their work', desc: 'Every insight names the number it rests on, so you can check it against your own file.' },
        { title: 'Written for your reader', desc: 'DIG works out who the report is for. A café owner gets plain words, and the statistics wait on a last page.' },
        { title: 'Ask, and it answers from your file', desc: 'Ask follow-up questions in plain words. DIG answers from your data, and tells you when a question is outside it.' },
        { title: 'Edit it alone or as a team', desc: 'Change any part of the report yourself, or ask the chat to. Every save is a version you can undo. On Pro, up to five people edit together.' },
      ],
    },
    switcher: { language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light' },
  },

  fr: {
    dir: 'ltr',
    nav: { features: 'Fonctionnalités', security: 'Sécurité', pricing: 'Tarifs', faq: 'FAQ', contact: 'Contact', menu: 'Menu' },
    hero: {
      title: 'Vos données ont une histoire. Nous vous aidons à la lire.',
      subtitle: "Importez un fichier CSV, Excel, JSON, Parquet ou SPSS et obtenez une analyse complète par IA — visualisations, patterns, anomalies et un rapport PDF professionnel. Sans code. Sans configuration. Juste des insights.",
      login: 'Connexion', register: "S'inscrire", demo: 'Essayer la démo interactive',
      note: "Découvrez tout ce que fait DIG dans la démo. Un compte gratuit l'applique à vos propres données et garde vos résultats.",
    },
    features: {
      heading: 'Le travail d’un analyste, fait pour vous.',
      subtitle: 'Pour les commerçants, analystes, chercheurs et étudiants qui veulent des réponses, pas des chiffres bruts.',
      cards: [
        { title: 'Il fait le ménage d’abord', desc: 'Repère les cellules vides, les lignes répétées et les valeurs impossibles, les corrige et vous montre exactement ce qui a changé.' },
        { title: 'Des constats qui se justifient', desc: 'Chaque constat cite le chiffre sur lequel il repose, pour que vous puissiez le vérifier dans votre propre fichier.' },
        { title: 'Écrit pour votre lecteur', desc: 'DIG comprend à qui s’adresse le rapport. Un patron de café reçoit des mots simples ; les statistiques attendent sur une dernière page.' },
        { title: 'Il répond depuis votre fichier', desc: 'Posez vos questions en mots simples. DIG répond à partir de vos données et vous prévient quand une question en sort.' },
        { title: 'Modifiez-le seul ou en équipe', desc: 'Changez n’importe quelle partie du rapport vous-même, ou demandez-le au chat. Chaque enregistrement est une version que vous pouvez annuler. Avec Pro, jusqu’à cinq personnes le modifient ensemble.' },
      ],
    },
    switcher: { language: 'Langue', theme: 'Thème', dark: 'Sombre', light: 'Clair' },
  },

  fa: {
    dir: 'rtl',
    nav: { features: 'ویژگی‌ها', security: 'امنیت', pricing: 'قیمت‌ها', faq: 'پرسش‌ها', contact: 'تماس', menu: 'منو' },
    hero: {
      title: 'داده‌های شما یک داستان دارند. ما کمک می‌کنیم آن را بخوانید.',
      subtitle: 'یک فایل CSV، اکسل، JSON، Parquet یا SPSS را آپلود کنید و تحلیل کامل مبتنی بر هوش مصنوعی دریافت کنید — تصویرسازی، الگوها، ناهنجاری‌ها و یک گزارش PDF حرفه‌ای. بدون کدنویسی. بدون راه‌اندازی.',
      login: 'ورود', register: 'ثبت‌نام', demo: 'امتحان دموی تعاملی',
      note: 'اول در دمو ببینید DIG چه کارهایی می‌کند. با یک حساب رایگان آن را روی داده‌های خودتان اجرا کنید و نتایج را نگه دارید.',
    },
    features: {
      heading: 'کار یک تحلیلگر، برای شما انجام می‌شود.',
      subtitle: 'برای صاحبان کسب‌وکار، تحلیلگران، پژوهشگران و دانشجویانی که پاسخ می‌خواهند، نه عدد خام.',
      cards: [
        { title: 'اول به‌هم‌ریختگی را مرتب می‌کند', desc: 'خانه‌های خالی، ردیف‌های تکراری و مقدارهای ناممکن را پیدا و پاک‌سازی می‌کند و دقیقاً نشان می‌دهد چه چیزی تغییر کرد.' },
        { title: 'یافته‌هایی که دلیلشان را نشان می‌دهند', desc: 'هر یافته عددی را که بر آن تکیه دارد نام می‌برد تا بتوانید آن را در فایل خودتان بررسی کنید.' },
        { title: 'نوشته‌شده برای خوانندهٔ شما', desc: 'DIG می‌فهمد گزارش برای چه کسی است. صاحب یک کافه زبان ساده می‌گیرد و آمار در صفحهٔ آخر می‌ماند.' },
        { title: 'از فایل خودتان جواب می‌گیرید', desc: 'پرسش‌هایتان را به زبان ساده بپرسید. DIG از داده‌های شما پاسخ می‌دهد و اگر پرسشی بیرون از آن‌ها باشد، می‌گوید.' },
        { title: 'تنها یا گروهی ویرایش کنید', desc: 'هر بخش گزارش را خودتان تغییر دهید یا از چت بخواهید. هر ذخیره نسخه‌ای است که می‌توانید برگردانید. با Pro تا پنج نفر با هم ویرایش می‌کنند.' },
      ],
    },
    switcher: { language: 'زبان', theme: 'تم', dark: 'تیره', light: 'روشن' },
  },
} as const;

type Lang = keyof typeof T;

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'fa', label: 'FA' },
];

const NAV = ['features', 'security', 'pricing', 'faq', 'contact'] as const;

// Mirrors the `max-width: 919px` media query in pageCss. The resize
// handler and the stylesheet must agree on where the phone menu stops
// existing, or the panel can outlive the button that dismisses it.
const MENU_BREAKPOINT = 919;

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

  // The phone menu. Closed on every render path that should dismiss it —
  // choosing a link, Escape, a tap outside, or the viewport growing wide
  // enough that the inline nav is back. Leaving it open across a resize would
  // strand a panel over a header that no longer has a button to close it.
  const [menuOpen, setMenuOpen] = useState(false);

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

    let done = false;

    const step = (now: number) => {
      if (done) return;
      const elapsed = Math.min(1, (now - startedAt) / duration);
      // easeInOutCubic: leaves and arrives gently, quick through the middle.
      const eased = elapsed < 0.5
        ? 4 * elapsed * elapsed * elapsed
        : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      window.scrollTo(0, start + distance * eased);
      if (elapsed < 1) requestAnimationFrame(step);
      else done = true;
    };
    requestAnimationFrame(step);

    // Safety net. requestAnimationFrame only runs while the page is being
    // composited: in a background tab, under power saving, and inside some
    // embedded webviews it is throttled to nothing. Measured 0 frames in 500ms
    // in one such host — the menu opened, the link registered, and the page
    // simply never moved, which reads as a dead link rather than a slow one.
    // The reveal effect already carries a timer for the same reason.
    //
    // A timer is not throttled the same way, so if the animation has not
    // finished by the time it should have, put the reader where they asked to
    // go. When rAF is healthy this fires after `done` and does nothing.
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.scrollTo(0, destination);
    }, duration + 250);
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

  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onPointer = (e: PointerEvent) => {
      const header = document.querySelector('header');
      if (header && !header.contains(e.target as Node)) setMenuOpen(false);
    };
    // MENU_BREAKPOINT mirrors the max-width in the stylesheet below. The two
    // have to agree: if CSS reveals the inline nav while React still thinks
    // the panel is open, both are on screen at once.
    const onResize = () => { if (window.innerWidth > MENU_BREAKPOINT) setMenuOpen(false); };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  const pageCss = [
    // Short enough that a reader who scrolls quickly never waits for words: at
    // a full second, with delays on top, a heading scrolled to was blank for
    // most of the time it took to look for it. The curve still decelerates into
    // place, and `will-change` keeps the transform on its own layer so a long
    // list does not judder.
    '.rv-armed [data-rv] { opacity: 0; transform: translateY(26px); will-change: opacity, transform;',
    // Colour is listed here too. This rule outranks .atlas-feature on
    // specificity, and a `transition` shorthand replaces rather than merges,
    // so a card's fill would otherwise snap on click instead of fading.
    '  transition: opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1),',
    '              background-color 0.25s ease, color 0.25s ease; }',
    // Headings, the line under each and the buttons move but are never
    // invisible: they are what someone skimming the page is looking for.
    '.rv-armed [data-rv="solid"] { opacity: 1; transform: translateY(14px); }',
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

    // ── Mobile header ───────────────────────────────────────────────────────
    // The bar is sticky, so its height is a permanent tax on the screen. At
    // 375px it wrapped onto three rows and stood 188px tall — nearly a quarter
    // of the phone visible area, held there for the whole scroll.
    //
    // The section anchors are the row that goes. They are a convenience
    // on a wide screen; on a phone the page is a scroll away and every other
    // control in the bar (sign-up, language, theme) is something you cannot
    // reach by scrolling. Below 520px the wordmark goes too, since the logo
    // already links home and the remaining controls need the width.
    //
    // Result: one row, ~62px, at every phone size.
    // The layout lives in the class, not inline: an inline `display: flex`
    // outranks a stylesheet rule, so the hide below silently did nothing
    // until the declaration moved here.
    '.atlas-nav { display: flex; gap: 18px; flex-wrap: wrap; }',
    // The button and the inline nav are mutually exclusive, and the panel
    // exists only where the button does.
    '.atlas-burger { display: none; }',
    '@media (pointer: fine) { .atlas-burger { min-height: 36px; } }',
    '@media (max-width: 919px) {',
    '  .atlas-nav { display: none; }',
    '  .atlas-burger { display: inline-flex; }',
    '}',
    '@media (min-width: 920px) { .atlas-menu { display: none; } }',
    '.atlas-header { gap: 18px; }',
    // In the class, not inline, so the phone rule below can hide it.
    '.atlas-lang { display: flex; }',
    '.atlas-lang button { padding: 5px 10px; }',
    // 320px (an SE-sized phone) was still two rows: logo plus the control
    // cluster came to 298px inside 288px of usable width. Ten pixels, so the
    // gap and the language buttons give them back rather than the layout
    // wrapping.
    '.atlas-logo { height: 34px; width: auto; }',
    '.atlas-theme { padding: 5px 9px; display: inline-flex; align-items: center; justify-content: center; }',
    '.atlas-menu-lang { display: none; gap: 6px; padding-top: 12px; }',
    '@media (max-width: 359px) {',
    '  .atlas-header .atlas-lang { display: none; }',
    '  .atlas-menu-lang { display: flex; }',
    '}',
    // Up to 519px, not 419: from 420px the wordmark came back beside a logo
    // that already spells the name, and the bar needed 438px of a 398px row.
    '@media (max-width: 519px) {',
    '  .atlas-wordmark { display: none; }',
    '  .atlas-header { gap: 10px; }',
    '  .atlas-lang button { padding: 5px 6px; }',
    '  .atlas-logo { height: 26px; }',
    '  .atlas-theme { padding: 5px 7px; }',
    '}',

    // ── Responsive grids ────────────────────────────────────────────────────
    // Explicit column counts at explicit widths, rather than
    // `repeat(auto-fit, minmax(300px, 1fr))`. Two things went wrong with
    // auto-fit here and both were invisible on a desktop monitor:
    //
    //   1. A `minmax(300px, ...)` track never shrinks below 300px. On a 320px
    //      phone the container is 288px, so the track overflowed it and the
    //      wrapper's `overflow-x: clip` quietly cut the cards off — the page
    //      reported no horizontal scroll while content sat outside the screen.
    //
    //   2. `grid-column: span 2` on the last card needs two tracks. Where
    //      auto-fit resolved to one, the browser invented an implicit second
    //      track to satisfy the span, which is where the ragged 300px/258px
    //      and 300px/124px columns at 600px and below came from.
    //
    // Counts are chosen so a card is never much under 300px: at 660px the two
    // columns are ~309px, at 1000px the three are ~312px. The last-child span
    // exists only where there are already two columns, so it can no longer
    // conjure a track of its own.
    '.atlas-features { display: grid; gap: 2px; grid-template-columns: minmax(0, 1fr); }',
    '@media (min-width: 660px) {',
    '  .atlas-features { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
    '  .atlas-features > :last-child { grid-column: span 2; }',
    '}',
    '@media (min-width: 1000px) {',
    '  .atlas-features { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    '  .atlas-features > :last-child { grid-column: span 2; }',
    '}',
  ].join('\n');

  const inner: React.CSSProperties = { maxWidth: '1120px', margin: '0 auto' };
  const sectionPad: React.CSSProperties = {
    padding: '76px clamp(16px, 3vw, 32px)',
    borderBottom: '2px solid ' + c.rule,
  };

  // Staggered delay, capped so a long list never leaves the reader waiting.
  const stagger = (i: number): React.CSSProperties => ({
    transitionDelay: Math.min(i, 4) * 40 + 'ms',
  });

  const eyebrow = (color: string): React.CSSProperties => ({
    margin: '0 0 10px', fontSize: '11.5px', fontWeight: 700,
    letterSpacing: '0.2em', color,
  });
  const h2 = (color: string): React.CSSProperties => ({
    margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(30px, 4vw, 46px)',
    fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.035em', color,
  });

  // Eight is the number of languages a report can be written in, which is a
  // Pro setting. The site itself is in three.
  const marqueeWords = lang === 'fr'
    ? ['DONNÉES EN ENTRÉE', 'ANALYSE EN SORTIE', 'SANS FORMULES', 'RAPPORT PDF', 'RAPPORTS EN 8 LANGUES AVEC PRO']
    : lang === 'fa'
      ? ['ورودی داده', 'خروجی تحلیل', 'بدون فرمول', 'گزارش PDF', 'گزارش به ۸ زبان در Pro']
      : ['DATA IN', 'ANALYSIS OUT', 'NO FORMULAS', 'PDF REPORT', 'REPORTS IN 8 LANGUAGES ON PRO'];

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
      <style>{pageCss + HOME_CSS}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header
        className="atlas-header"
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: c.paper, borderBottom: '2px solid ' + c.rule,
          padding: '8px clamp(16px, 3vw, 32px)', minHeight: '62px',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
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
          <img src="/DIG.png" alt="" className="atlas-logo" />
          <span className="atlas-wordmark" style={{
            fontFamily: DISPLAY, fontSize: '19px', fontWeight: 800,
            letterSpacing: '-0.04em', color: c.ink,
          }}>
            DIG
          </span>
        </Link>

        <nav className="atlas-nav">
          {NAV.map(k => (
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

        {/* Phone menu. The same anchors the wide layout shows inline —
            hiding them outright would have been the cheaper fix, but the
            sections are the only thing on this page a reader might want to
            reach directly. Bars rather than an icon font so it costs nothing
            and cannot fail to load. */}
        <button
          type="button"
          className="atlas-burger atlas-tap"
          aria-expanded={menuOpen}
          aria-controls="atlas-menu"
          aria-label={t.nav.menu}
          onClick={() => setMenuOpen(o => !o)}
          style={{
            flexDirection: 'column', justifyContent: 'center', gap: '4px',
            width: '44px', padding: '0 10px', cursor: 'pointer',
            background: 'transparent', border: '1.5px solid ' + c.hairline,
          }}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                display: 'block', width: '18px', height: '2px', background: c.ink,
                transition: 'transform 0.2s ease, opacity 0.2s ease',
                // Closed: three bars. Open: the outer two cross and the
                // middle disappears, so the control says how to undo itself.
                transform: menuOpen
                  ? (i === 0 ? 'translateY(6px) rotate(45deg)'
                    : i === 2 ? 'translateY(-6px) rotate(-45deg)' : 'none')
                  : 'none',
                opacity: menuOpen && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </button>

        {menuOpen && (
          <div
            id="atlas-menu"
            className="atlas-menu"
            style={{
              position: 'absolute', top: '100%', insetInline: 0,
              background: c.paper, borderBottom: '2px solid ' + c.rule,
              padding: '6px clamp(16px, 3vw, 32px) 12px',
              flexDirection: 'column', display: 'flex',
            }}
          >
            {NAV.map(k => (
              <a
                key={k}
                href={'#' + k}
                onClick={e => { e.preventDefault(); setMenuOpen(false); scrollToSection(k); }}
                className="atlas-link atlas-tap"
                style={{
                  fontFamily: DISPLAY, fontSize: '17px', fontWeight: 700,
                  letterSpacing: '-0.02em', color: c.ink, textDecoration: 'none',
                  padding: '12px 0', borderBottom: '1px solid ' + c.hairline,
                  minHeight: '52px',
                }}
              >
                {t.nav[k]}
              </a>
            ))}
            {/* Below 360px the language buttons leave the bar for here: with
                them, the bar needed 336px of a 288px row and wrapped. */}
            <div className="atlas-menu-lang" role="group" aria-label={t.switcher.language}>
              {LANGS.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className="atlas-tap"
                  style={{
                    flex: 1, cursor: 'pointer', fontFamily: SANS, fontSize: '13px',
                    fontWeight: lang === l.code ? 700 : 500,
                    border: '1.5px solid ' + c.hairline,
                    background: lang === l.code ? c.ink : 'transparent',
                    color: lang === l.code ? c.paper : c.inkSoft,
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{
          marginInlineStart: 'auto', display: 'flex', alignItems: 'center',
          gap: '6px', flexWrap: 'wrap',
        }}>
          <div className="atlas-lang" style={{ border: '1.5px solid ' + c.hairline }}>
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className="atlas-tap"
                style={{
                  border: 'none', cursor: 'pointer',
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

          {/* An icon rather than the word: "Sombre" and "Clair" were what
              pushed the bar onto a second row on a phone. */}
          <button
            type="button"
            onClick={() => setBrightness(brightness > 65 ? 10 : 80)}
            className="atlas-tap atlas-theme"
            aria-label={t.switcher.theme + ': ' + (light ? t.switcher.light : t.switcher.dark)}
            title={t.switcher.theme + ': ' + (light ? t.switcher.light : t.switcher.dark)}
            style={{
              cursor: 'pointer', background: 'transparent',
              border: '1.5px solid ' + c.hairline, color: c.inkSoft,
            }}
          >
            {light ? <MoonIcon size={15} /> : <SunIcon size={15} />}
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
        {/* Vertical rhythm is governed by the SHORTER side of the viewport,
             not the width. Sized on width alone, a 1280x560 laptop window got
             the full 80px headline and 76px of padding, so the hero grew to
             685px inside a 560px viewport and the "how it works" sheet — which
             is meant to peek above the fold and invite a scroll — sat entirely
             below it. `min(7vw, 9vh)` gives a wide monitor the generous
             spacing it has room for and quietly tightens a short window.
             Horizontal padding stays width-only, which is what it measures. */}
        <section style={{
          background: c.cobalt, color: '#ffffff',
          padding: 'clamp(32px, min(7vw, 9vh), 76px) clamp(16px, 3vw, 32px) 0',
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
            <h1 data-rv="solid" style={{
              margin: 0, fontFamily: DISPLAY,
              // Same reasoning as the section padding above. On a phone the
              // width term is far smaller than the height term, so `min` picks
              // width and the 36px floor still governs — the vh half only ever
              // bites on a short, wide window.
              fontSize: 'clamp(36px, min(6.4vw, 10.5vh), 80px)', fontWeight: 800,
              lineHeight: 0.98, letterSpacing: '-0.045em',
              maxWidth: '18ch', textWrap: 'pretty',
            }}>
              {t.hero.title}
            </h1>

            <p data-rv="solid" style={{
              ...stagger(1),
              margin: '26px 0 0', fontSize: 'clamp(15px, 1.5vw, 18px)',
              lineHeight: 1.55, maxWidth: '58ch', color: 'rgba(255,255,255,0.82)',
            }}>
              {t.hero.subtitle}
            </p>

            <div data-rv="solid" style={{
              ...stagger(2),
              display: 'flex', gap: '10px', margin: '32px 0 0', flexWrap: 'wrap',
            }}>
              {/* The demo takes the place the guest dashboard had: see the whole
                  product first, then an account runs it on your own data. */}
              <Link href="/demo" className="atlas-btn" style={{
                padding: '15px 22px', background: c.lime, color: '#12121a',
                border: '2px solid #12121a', textDecoration: 'none',
                fontFamily: DISPLAY, fontSize: '15px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '10px',
              }}>
                <span aria-hidden="true" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '22px', height: '22px', background: '#12121a', color: c.lime,
                }}>
                  <PlayIcon />
                </span>
                {t.hero.demo}
              </Link>
              <Link href="/register" className="atlas-btn" style={{
                padding: '15px 26px', background: '#ffffff', color: '#12121a',
                border: '2px solid #12121a', textDecoration: 'none',
                fontFamily: DISPLAY, fontSize: '15px', fontWeight: 700,
              }}>
                {t.hero.register}
              </Link>
              <Link href="/login" className="atlas-btn" style={{
                padding: '15px 26px', background: 'transparent', color: '#ffffff',
                border: '2px solid rgba(255,255,255,0.55)', textDecoration: 'none',
                fontSize: '14px', fontWeight: 600,
              }}>
                {t.hero.login}
              </Link>
            </div>

            <p data-rv="solid" style={{
              ...stagger(3),
              margin: '16px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.7)',
            }}>
              {t.hero.note}
            </p>

            {/* The product itself, laid on the cobalt field like a sheet of
                paper and overlapping the fold so the page invites a scroll. */}
            <div data-rv style={{ ...stagger(4), margin: 'clamp(22px, min(5vw, 5vh), 56px) auto -2px' }}>
              <HeroShot lang={lang} />
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

        <ProofSection lang={lang} />

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section id="features" style={sectionPad}>
          <div style={inner}>
            <p data-rv="solid" style={eyebrow(c.inkFaint)}>{t.nav.features.toUpperCase()}</p>
            <h2 data-rv="solid" style={{ ...h2(c.ink), ...stagger(1), maxWidth: '20ch' }}>
              {t.features.heading}
            </h2>
            <p data-rv="solid" style={{
              ...stagger(2),
              margin: '0 0 44px', fontSize: '16px', lineHeight: 1.6,
              color: c.inkSoft, maxWidth: '62ch',
            }}>
              {t.features.subtitle}
            </p>

            {/* Three columns at most, and the last card spans two so the row
                always fills — with five cards and no span the leftover cell
                showed the grid container's own background as a bare block.
                The column counts live in .atlas-features; see the note there
                for why they are explicit rather than auto-fit. */}
            <div className="atlas-features" style={{
              background: c.rule, border: '2px solid ' + c.rule,
            }}>
              {t.features.cards.map((card, i) => {
                const open = openFeature === i;
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

        <FilesSection lang={lang} />

        {/* The second blue block, so the page reads blue / paper / blue / citron. */}
        <SecuritySection lang={lang} />

        <PricingSection lang={lang} eyebrow={t.nav.pricing} />

        <FaqSection lang={lang} />

        <ClosingSection lang={lang} />
      </main>

      <SiteFooter lang={lang} />
    </div>
  );
}
