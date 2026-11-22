"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth }    from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI      from "@/lib/BackendAPI";
import { followAnalysis, type RunOutcome } from "@/lib/followAnalysis";
import type { Analysis, AnalysisStatus, UploadedFileMeta } from "@/lib/types";
import UploadCard      from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import HistoryTape     from "@/components/HistoryTape";
import ChartsCard      from "@/components/chartsCard";
import DownloadsCard   from "@/components/downloadCard";
import ReportEditor    from "@/components/ReportEditor";
import InfoCards       from "@/components/infoCards";

// What each plan keeps and allows. The server holds the real limits
// (AnalysisGate, ChatQuota); these only label them.
const KEPT      = { free: 5,  pro: 15 };
const QUESTIONS = { free: 10, pro: 100 };

// ── Translations ──────────────────────────────────────────────────────────────
const DASH_T = {
  en: {
    eyebrow: (plan: string) => `${plan} · Dashboard`,
    planName: { free: "Free plan", pro: "Pro plan", admin: "Admin" },
    greeting: (part: "morning" | "afternoon" | "evening", name: string) =>
      `Good ${part}${name ? `, ${name}` : ""}.`,
    subtitle: "Upload a file to get a report, or open one from your analyses.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} rows`,
    nav: {
      home: "Home", upload: "New analysis", charts: "Charts", report: "Report",
      history: "Your analyses", help: "Help",
      settings: "Settings", signOut: "Sign out",
      team: "Team", admin: "Admin", pro: "PRO",
    },
    profile: {
      view: "View profile", account: "Account settings", billing: "Plan and billing",
      memberSince: (d: string) => `Member since ${d}`,
    },
    meters: {
      label: "What you have used",
      kept: "Analyses kept",
      of: (n: number) => `of ${n}`,
      keptNote: (n: number) => `Analysis ${n + 1} replaces the oldest.`,
      questions: "Questions a day",
      questionsNote: "About your report, in the chat. Starts again each day at midnight UTC.",
      team: "Team editing",
      teamFree: "On Pro",
      teamFreeNote: "Up to 5 people edit one report together and see each other's saves.",
      teamPro: "Included",
      teamProNote: "Share an analysis with your team and edit the report together.",
      openTeam: "Open your team",
    },
    plan: {
      freeNote: "5 analyses kept, 10 questions a day.",
      freeCta: "See what Pro adds",
      proNote: "15 analyses kept, 100 questions a day, team editing.",
      proCta: "Plan and billing",
    },
    band: {
      eyebrow: "PRO · $9.99 CAD A MONTH",
      title: "Keep 15 analyses, ask 100 questions a day, and edit reports with your team.",
      cta: "See Pro",
    },
    bannerDone:    "Analysis complete. The report, charts and cleaned data are ready.",
    bannerRunning: "Analysis running. Results appear here when it finishes.",
    bannerFailed:  "The analysis failed. Please upload your file again.",
    bannerLost:    "We lost track of this analysis. It may still finish: refresh in a minute and look in your analyses.",
    viewReport:    "Open the report",
    newSession:    "New analysis",
  },
  fr: {
    eyebrow: (plan: string) => `${plan} · Tableau de bord`,
    planName: { free: "Offre gratuite", pro: "Offre Pro", admin: "Admin" },
    greeting: (_part: "morning" | "afternoon" | "evening", name: string) =>
      `Bonjour${name ? `, ${name}` : ""}.`,
    subtitle: "Importez un fichier pour obtenir un rapport, ou ouvrez une de vos analyses.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} lignes`,
    nav: {
      home: "Accueil", upload: "Nouvelle analyse", charts: "Graphiques", report: "Rapport",
      history: "Vos analyses", help: "Aide",
      settings: "Paramètres", signOut: "Déconnexion",
      team: "Équipe", admin: "Admin", pro: "PRO",
    },
    profile: {
      view: "Voir le profil", account: "Paramètres du compte", billing: "Offre et facturation",
      memberSince: (d: string) => `Membre depuis ${d}`,
    },
    meters: {
      label: "Votre utilisation",
      kept: "Analyses conservées",
      of: (n: number) => `sur ${n}`,
      keptNote: (n: number) => `L'analyse ${n + 1} remplace la plus ancienne.`,
      questions: "Questions par jour",
      questionsNote: "Sur votre rapport, dans le chat. Repart chaque jour à minuit UTC.",
      team: "Édition en équipe",
      teamFree: "Avec Pro",
      teamFreeNote: "Jusqu'à 5 personnes modifient un rapport ensemble et voient les enregistrements des autres.",
      teamPro: "Incluse",
      teamProNote: "Partagez une analyse avec votre équipe et modifiez le rapport ensemble.",
      openTeam: "Ouvrir votre équipe",
    },
    plan: {
      freeNote: "5 analyses conservées, 10 questions par jour.",
      freeCta: "Ce que Pro ajoute",
      proNote: "15 analyses conservées, 100 questions par jour, édition en équipe.",
      proCta: "Offre et facturation",
    },
    band: {
      eyebrow: "PRO · 9,99 $ CA PAR MOIS",
      title: "Conservez 15 analyses, posez 100 questions par jour et modifiez vos rapports en équipe.",
      cta: "Voir Pro",
    },
    bannerDone:    "Analyse terminée. Le rapport, les graphiques et les données nettoyées sont prêts.",
    bannerRunning: "Analyse en cours. Les résultats apparaîtront ici à la fin.",
    bannerFailed:  "L'analyse a échoué. Veuillez réimporter votre fichier.",
    bannerLost:    "Nous avons perdu le suivi de cette analyse. Elle peut encore se terminer : actualisez dans une minute et regardez vos analyses.",
    viewReport:    "Ouvrir le rapport",
    newSession:    "Nouvelle analyse",
  },
  fa: {
    eyebrow: (plan: string) => `${plan} · داشبورد`,
    planName: { free: "طرح رایگان", pro: "طرح پرو", admin: "مدیر" },
    greeting: (_part: "morning" | "afternoon" | "evening", name: string) =>
      `سلام${name ? `، ${name}` : ""}.`,
    subtitle: "یک فایل آپلود کنید تا گزارش بگیرید، یا یکی از تحلیل‌هایتان را باز کنید.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} ردیف`,
    nav: {
      home: "خانه", upload: "تحلیل جدید", charts: "نمودارها", report: "گزارش",
      history: "تحلیل‌های شما", help: "راهنما",
      settings: "تنظیمات", signOut: "خروج",
      team: "تیم", admin: "مدیریت", pro: "پرو",
    },
    profile: {
      view: "مشاهده پروفایل", account: "تنظیمات حساب", billing: "طرح و پرداخت",
      memberSince: (d: string) => `عضو از ${d}`,
    },
    meters: {
      label: "میزان استفاده شما",
      kept: "تحلیل‌های نگه‌داشته",
      of: (n: number) => `از ${n}`,
      keptNote: (n: number) => `تحلیل ${n + 1} جای قدیمی‌ترین را می‌گیرد.`,
      questions: "پرسش در روز",
      questionsNote: "درباره گزارش، در گفتگو. هر روز نیمه‌شب UTC از نو شروع می‌شود.",
      team: "ویرایش تیمی",
      teamFree: "در طرح پرو",
      teamFreeNote: "تا ۵ نفر با هم یک گزارش را ویرایش می‌کنند و ذخیره‌های یکدیگر را می‌بینند.",
      teamPro: "فعال",
      teamProNote: "یک تحلیل را با تیمتان به اشتراک بگذارید و گزارش را با هم ویرایش کنید.",
      openTeam: "باز کردن تیم",
    },
    plan: {
      freeNote: "۵ تحلیل نگه‌داشته، ۱۰ پرسش در روز.",
      freeCta: "امکانات پرو",
      proNote: "۱۵ تحلیل نگه‌داشته، ۱۰۰ پرسش در روز، ویرایش تیمی.",
      proCta: "طرح و پرداخت",
    },
    band: {
      eyebrow: "پرو · ۹٫۹۹ دلار کانادا در ماه",
      title: "۱۵ تحلیل نگه دارید، روزی ۱۰۰ پرسش بپرسید و گزارش‌ها را با تیمتان ویرایش کنید.",
      cta: "دیدن پرو",
    },
    bannerDone:    "تحلیل کامل شد. گزارش، نمودارها و داده‌های پاکسازی‌شده آماده‌اند.",
    bannerRunning: "تحلیل در حال اجراست. نتایج پس از پایان اینجا نمایش داده می‌شوند.",
    bannerFailed:  "تحلیل ناموفق بود. لطفاً فایل خود را دوباره آپلود کنید.",
    bannerLost:    "پیگیری این تحلیل قطع شد. ممکن است هنوز کامل شود: یک دقیقه دیگر صفحه را تازه کنید و تحلیل‌هایتان را ببینید.",
    viewReport:    "باز کردن گزارش",
    newSession:    "تحلیل جدید",
  },
};

function partOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/*
  DASHBOARD FLOW — v2 (clean-slate model):

  1. Login         → dashboard loads EMPTY. No auto-loaded previous session.
  2. Your analyses → user sees last 5 (free) or 15 (pro) completed analyses.
  3. Load history  → user clicks an item → that analysis fills all cards.
  4. New upload    → resets everything → new session starts → chatbot is idle.
  5. Start analy   → chatbot sends "start_analysis" → pipeline runs → polling starts.
  6. Done polling  → all cards fill with new data → analysis added to history.
  7. Delete hist   → item removed from list; if it was the active one, clear dashboard.
*/

export default function DashboardPage() {
  const router  = useRouter();
  const { logout, user, token, refreshUser, isLoading } = useAuth();
  const { lang } = useSettings();
  const t = DASH_T[lang] || DASH_T.en;

  const rtl     = lang === "fa";
  const plan    = user?.plan ?? "free";
  const isAdmin = plan === "admin";

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [token, isLoading]);

  // Block browser back button out of dashboard
  useEffect(() => {
    window.history.pushState({ dashboard: true }, "");
    const handle = (e: PopStateEvent) => {
      if (!e.state?.dashboard) router.replace("/login");
      else window.history.pushState({ dashboard: true }, "");
    };
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, [router]);

  // ── State ────────────────────────────────────────────────────────────────────
  const [activeSection,  setActiveSection]  = useState("top");

  // The currently-loaded analysis (null = clean slate)
  const [analysis,       setAnalysis]       = useState<Analysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [reportReady,    setReportReady]    = useState(false);
  const [hasPdfReport,   setHasPdfReport]   = useState(false);
  const [runLost,        setRunLost]        = useState(false);

  // Pro report settings. Held here because the assistant card remounts on each
  // upload, and a brief written before the file went in must survive that.
  const [reportSettings, setReportSettings] = useState<object | null>(null);

  // History list (loaded once on mount)
  const [history,        setHistory]        = useState<Analysis[]>([]);

  // Keys to force child remounts
  const [analysisKey,    setAnalysisKey]    = useState(0);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  const topRef      = useRef<HTMLElement | null>(null);
  const uploadRef   = useRef<HTMLElement | null>(null);
  const chartsRef   = useRef<HTMLElement | null>(null);
  const downloadRef = useRef<HTMLElement | null>(null);
  const helpRef     = useRef<HTMLElement | null>(null);
  const historyRef  = useRef<HTMLElement | null>(null);
  const pollRef     = useRef<(() => void) | null>(null);

  // Read when used. A callback kept from the first render holds the first
  // render's token: blank on a page just loaded, expired on one left open.
  const tokenRef    = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // ── Load history on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    refreshUser();
    BackendAPI.getHistory(token)
      .then(h => setHistory(h ?? []))
      .catch(() => {});
  }, [token]);

  // ── Also check if there's an active pipeline from a previous session ────────
  useEffect(() => {
    if (!token) return;
    BackendAPI.getActiveAnalysis(token)
      .then(active => {
        if (active && (active.status === "processing" || active.status === "pending")) {
          setAnalysis(active);
          setAnalysisStatus(active.status);
          startPolling(active.id);
        }
      })
      .catch(() => {});
  }, [token]);

  // ── Load a history item into the dashboard ──────────────────────────────────
  const handleLoadHistory = useCallback((item: Analysis) => {
    stopPolling();
    setRunLost(false);
    setAnalysis(item);
    setAnalysisStatus(item.status);
    setHasPdfReport(item.hasPdfReport ?? false);
    setReportReady(item.status === "done");
    setAnalysisKey(k => k + 1);
    scrollTo("section-upload", uploadRef);
  }, []);

  // ── New upload → reset everything ──────────────────────────────────────────
  const handleUploadSuccess = useCallback((tempMeta: UploadedFileMeta) => {
    stopPolling();
    setRunLost(false);
    // No server id yet — the analysis row is created when the pipeline starts.
    // Marked isPending so the header renders the neutral subtitle.
    setAnalysis({ ...tempMeta, id: "", status: "pending", isPending: true });
    setAnalysisStatus("pending");
    setReportReady(false);
    setHasPdfReport(false);
    setAnalysisKey(k => k + 1);
  }, []);

  // ── Upload refused ──────────────────────────────────────────────────────────
  // The server dropped whatever was waiting, so Start must not offer it. A
  // finished analysis on screen stays: it is stored, and unaffected.
  const handleUploadFailed = useCallback(() => {
    if (!analysis?.isPending) return;
    setAnalysis(null);
    setAnalysisStatus(null);
    setAnalysisKey(k => k + 1);
  }, [analysis]);

  // ── Analysis started (chatbot confirmed) ────────────────────────────────────
  const handleAnalysisStarted = useCallback((analysisId: string | null) => {
    setAnalysisStatus("processing");
    startPolling(analysisId);
  }, []);

  // ── Following a run ───────────────────────────────────
  const showRunLost = useCallback(() => {
    setAnalysis(null);
    setAnalysisStatus(null);
    setReportReady(false);
    setHasPdfReport(false);
    setRunLost(true);
    setAnalysisKey(k => k + 1);
    setUploadResetKey(k => k + 1);
  }, []);

  const finishRun = useCallback(async (analysisId: string, outcome: RunOutcome) => {
    // History first: a run this page lost track of may well have finished.
    const fresh = await BackendAPI.getHistory(tokenRef.current).catch(() => null);
    if (fresh) setHistory(fresh);
    if (outcome === "lost") { showRunLost(); return; }

    try {
      const updated = await BackendAPI.getAnalysis(tokenRef.current, analysisId);
      setAnalysis(updated);
      if (updated?.hasPdfReport) {
        setReportReady(true);
        setHasPdfReport(true);
      }
      setAnalysisKey(k => k + 1);
      setUploadResetKey(k => k + 1);
    } catch {
      showRunLost();
    }
  }, [showRunLost]);

  const startPolling = useCallback((analysisId: string | null) => {
    stopPolling();
    if (!analysisId) { showRunLost(); return; }
    pollRef.current = followAnalysis({
      check:    () => BackendAPI.getAnalysisStatus(tokenRef.current, analysisId),
      onStatus: status => setAnalysisStatus(status as AnalysisStatus),
      onEnd:    outcome => {
        pollRef.current = null;
        void finishRun(analysisId, outcome);
      },
    });
  }, [finishRun, showRunLost]);

  const stopPolling = () => {
    pollRef.current?.();
    pollRef.current = null;
  };
  useEffect(() => () => stopPolling(), []);

  // ── History item deleted ─────────────────────────────────────────────────────
  const handleHistoryDeleted = useCallback((deletedId: string) => {
    setHistory(prev => prev.filter(h => h.id !== deletedId));
    if (analysis?.id === deletedId) {
      setAnalysis(null);
      setAnalysisStatus(null);
      setReportReady(false);
      setHasPdfReport(false);
      setAnalysisKey(k => k + 1);
    }
  }, [analysis]);

  // The tape owns the confirmation UI and calls this once the user confirms.
  // The API call lives here so the tape stays presentational.
  const handleDeleteFromTape = useCallback(async (deletedId: string) => {
    if (!token) return;

    // Optimistic: the card disappears immediately. If the request fails the
    // history is refetched, which restores it — better than leaving the user
    // looking at a card that will not go away.
    setHistory(prev => prev.filter(h => h.id !== deletedId));
    try {
      await BackendAPI.deleteAnalysis(token, deletedId);
    } catch {
      // The analysis still exists on the server. Restore the list and leave the
      // dashboard alone — clearing the loaded analysis here would tell the user
      // a deletion succeeded when it did not.
      const fresh = await BackendAPI.getHistory(token).catch(() => null);
      if (fresh) setHistory(fresh);
      return;
    }
    handleHistoryDeleted(deletedId);
  }, [token, handleHistoryDeleted]);

  // ── Clear / start new session ────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    stopPolling();
    setRunLost(false);
    setAnalysis(null);
    setAnalysisStatus(null);
    setReportReady(false);
    setHasPdfReport(false);
    setReportSettings(null);
    setAnalysisKey(k => k + 1);
    setUploadResetKey(k => k + 1);
    scrollTo("section-upload", uploadRef);
  }, []);

  // ── Intersection observer → sidebar highlight ───────────────────────────────
  useEffect(() => {
    const sections = [
      { id: "top",              ref: topRef },
      { id: "section-upload",   ref: uploadRef },
      { id: "section-charts",   ref: chartsRef },
      { id: "section-download", ref: downloadRef },
      { id: "section-history",  ref: historyRef },
      { id: "section-help",     ref: helpRef },
    ];
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }),
      { threshold: 0.3 }
    );
    sections.forEach(s => { if (s.ref.current) obs.observe(s.ref.current); });
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string, ref: React.RefObject<HTMLElement | null> | null) => {
    ref?.current?.scrollIntoView({ behavior: "smooth" });
    setActiveSection(id);
  };
  const scrollToReport = () => scrollTo("section-download", downloadRef);

  // ── User display ─────────────────────────────────────────────────────────────
  const firstName    = user?.firstName ?? "";
  const lastName     = user?.lastName  ?? "";
  const fullName     = `${firstName} ${lastName}`.trim();
  const displayName  = fullName || user?.userName || "User";
  const avatarLetter = (firstName?.charAt(0) || user?.userName?.charAt(0) || "U").toUpperCase();
  const avatarUrl    = user?.profilePicture ?? null;
  const memberSince  = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-CA", { month: "short", year: "numeric" })
    : null;

  const showProcessing = (analysisStatus === "processing" || analysisStatus === "pending")
    && !reportReady && !!analysis;
  const showFailed     = analysisStatus === "failed";

  const isPro     = plan === "pro" || isAdmin;
  const tier      = isPro ? "pro" : "free";
  const planName  = isAdmin ? t.planName.admin : t.planName[tier];
  const kept      = KEPT[tier];
  const keptShare = Math.min(100, Math.round((history.length / kept) * 100));

  const navItems = [
    { id: "top",              label: t.nav.home,    icon: <IconGrid />,    ref: topRef },
    { id: "section-upload",   label: t.nav.upload,  icon: <IconUpload />,  ref: uploadRef },
    { id: "section-charts",   label: t.nav.charts,  icon: <IconChart />,   ref: chartsRef },
    { id: "section-download", label: t.nav.report,  icon: <IconReport />,  ref: downloadRef },
    { id: "section-history",  label: t.nav.history, icon: <IconHistory />, ref: historyRef },
    { id: "section-help",     label: t.nav.help,    icon: <IconHelp />,    ref: helpRef },
  ];

  if (isLoading) return null;
  if (!token)    return null;

  return (
    <div className="dig-body"
      style={{ display: "flex", minHeight: "100vh", width: "100%",
        direction: rtl ? "rtl" : "ltr" }}>

      {/* ── SIDEBAR ── */}
      <aside className="dig-sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/d_dig.svg" alt="" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard">
          {navItems.map(item => (
            <button key={item.id}
              className={`sidebar-link ${activeSection === item.id ? "active" : ""}`}
              aria-current={activeSection === item.id ? "location" : undefined}
              onClick={() => scrollTo(item.id, item.ref)}>
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className={`atlas-plan-card ${isPro ? "pro" : ""}`}>
            <p className="atlas-plan-name">{planName.toUpperCase()}</p>
            <p>{isPro ? t.plan.proNote : t.plan.freeNote}</p>
            <button className="atlas-btn"
              onClick={() => router.push(isPro ? "/dashboard/plan" : "/plans")}>
              {isPro ? t.plan.proCta : t.plan.freeCta}
            </button>
          </div>

          {/* Anyone can be in a team: a free account can be invited to one. */}
          <button className="sidebar-link" onClick={() => router.push("/dashboard/team")}>
            <span className="sidebar-icon"><IconTeam /></span>
            <span className="sidebar-label">{t.nav.team}</span>
            {!isPro && <span className="atlas-pro-tag">{t.nav.pro}</span>}
          </button>

          {isAdmin && (
            <button className="sidebar-link" onClick={() => router.push("/admin")}>
              <span className="sidebar-icon"><IconAdmin /></span>
              <span className="sidebar-label">{t.nav.admin}</span>
            </button>
          )}

          <button className="sidebar-link" onClick={() => router.push("/dashboard/settings")}>
            <span className="sidebar-icon"><IconSettings /></span>
            <span className="sidebar-label">{t.nav.settings}</span>
          </button>

          <button className="sidebar-link" onClick={() => { logout(); router.push("/"); }}>
            <span className="sidebar-icon"><IconSignOut /></span>
            <span className="sidebar-label">{t.nav.signOut}</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="dig-main">

        <header className="dig-topbar" id="top" ref={topRef}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <p className="atlas-eyebrow">{t.eyebrow(planName)}</p>
            <h1>{t.greeting(partOfDay(), firstName)}</h1>
            <p className="subtitle">
              {analysis && !analysis.isPending
                ? t.subtitleActive(analysis.fileName, analysis.rowCount ?? undefined)
                : t.subtitle}
            </p>
          </div>

          <div className="topbar-right" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            <button className="atlas-btn lime" onClick={handleNewSession}
              style={{ minHeight: "52px", padding: "0 22px", fontSize: "1rem" }}>
              <IconPlus /> {t.newSession}
            </button>

            <div className="profile-wrapper">
              <button className="avatar" aria-label={t.profile.view}
                style={{ ...(avatarUrl ? { padding: 0, overflow: "hidden" } : {}), cursor: "pointer", border: "none" }}
                onClick={() => router.push("/dashboard/profileView")}>
                {avatarUrl
                  ? <img src={avatarUrl} alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : avatarLetter}
              </button>
              <div className="profile-text" style={{ cursor: "pointer" }}
                onClick={() => router.push("/dashboard/profileView")}>
                <span className="profile-name">{displayName}</span>
                <span className="profile-role">
                  {memberSince ? t.profile.memberSince(memberSince) : planName}
                </span>
              </div>
              <div className="profile-dropdown-icon" aria-hidden="true">▾</div>
              <div className="profile-dropdown">
                <a href="/dashboard/profileView" onClick={e => { e.preventDefault(); router.push("/dashboard/profileView"); }}>
                  {t.profile.view}
                </a>
                <a href="/dashboard/editProfile" onClick={e => { e.preventDefault(); router.push("/dashboard/editProfile"); }}>
                  {t.profile.account}
                </a>
                <a href="/dashboard/plan" onClick={e => { e.preventDefault(); router.push("/dashboard/plan"); }}>
                  {t.profile.billing}
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* ── Notices ── */}
        {reportReady && (
          <div className="atlas-notice ok" role="status">
            <span>{t.bannerDone}</span>
            <button className="atlas-btn" onClick={scrollToReport}>{t.viewReport}</button>
          </div>
        )}

        {showProcessing && (
          <div className="atlas-notice info" role="status">
            <span>{t.bannerRunning}</span>
          </div>
        )}

        {showFailed && (
          <div className="atlas-notice bad" role="alert">
            <span>{t.bannerFailed}</span>
          </div>
        )}

        {runLost && (
          <div className="atlas-notice warn" role="status">
            <span>{t.bannerLost}</span>
          </div>
        )}

        {/* ── What you have used ── */}
        <section className="atlas-meters" aria-label={t.meters.label}>
          <div className="atlas-meter">
            <p className="atlas-meter-label">{t.meters.kept}</p>
            <p className="atlas-meter-value">{history.length} <span>{t.meters.of(kept)}</span></p>
            <div className="atlas-meter-track" aria-hidden="true"><div style={{ width: `${keptShare}%` }} /></div>
            <p className="atlas-meter-note">{t.meters.keptNote(kept)}</p>
          </div>

          <div className="atlas-meter">
            <p className="atlas-meter-label">{t.meters.questions}</p>
            <p className="atlas-meter-value">{QUESTIONS[tier]}</p>
            <p className="atlas-meter-note">{t.meters.questionsNote}</p>
          </div>

          {isPro ? (
            <a className="atlas-meter" href="/dashboard/team"
              onClick={e => { e.preventDefault(); router.push("/dashboard/team"); }}>
              <p className="atlas-meter-label">{t.meters.team}</p>
              <p className="atlas-meter-value" style={{ fontSize: "1.5rem" }}>{t.meters.teamPro}</p>
              <p className="atlas-meter-note">{t.meters.teamProNote}</p>
              <p className="atlas-meter-note" style={{ color: "var(--cobalt-accent)", fontWeight: 600 }}>{t.meters.openTeam} →</p>
            </a>
          ) : (
            <div className="atlas-meter muted-box">
              <p className="atlas-meter-label">{t.meters.team}</p>
              <p className="atlas-meter-value" style={{ fontSize: "1.5rem" }}>{t.meters.teamFree}</p>
              <p className="atlas-meter-note">{t.meters.teamFreeNote}</p>
            </div>
          )}
        </section>

        {/* 1. Upload + Chatbot */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard onUploadSuccess={handleUploadSuccess} onUploadFailed={handleUploadFailed} resetKey={uploadResetKey} />
          <AnalysisAssistantCard
            key={analysisKey}
            dataset={analysis}
            reportReady={reportReady}
            onViewReport={scrollToReport}
            onAnalysisStarted={handleAnalysisStarted}
            plan={plan}
            settings={reportSettings}
            onSettingsChange={setReportSettings}
          />
        </section>

        {/* 2. Charts */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard dataset={analysis} />
        </section>

        {/* 3. Report: edit it, then download it */}
        <section id="section-download" ref={downloadRef}>
          <ReportEditor key={`edit-${analysisKey}`} analysis={analysis} ready={reportReady && hasPdfReport} />
          <DownloadsCard dataset={analysis
            ? { ...analysis, hasPdfReport: hasPdfReport }
            : null}
          />
        </section>

        {/* 4. Your analyses. A finished analysis lands here rather than
            replacing what is on screen; opening one loads it above. */}
        <section id="section-history" ref={historyRef}>
          <HistoryTape
            history={history}
            activeId={analysis?.id ?? null}
            plan={plan}
            busy={analysisStatus === "processing" || analysisStatus === "pending"}
            lang={lang}
            onLoad={handleLoadHistory}
            onDelete={handleDeleteFromTape}
            onUpgrade={() => router.push("/plans")}
          />
        </section>

        {!isPro && (
          <section className="atlas-band" aria-label={t.band.cta}>
            <div>
              <p>{t.band.eyebrow}</p>
              <h2>{t.band.title}</h2>
            </div>
            <button className="atlas-btn" onClick={() => router.push("/plans")}>{t.band.cta}</button>
          </section>
        )}

        {/* 5. Help */}
        <section id="section-help" ref={helpRef}>
          <InfoCards />
        </section>
      </main>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconGrid()     { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IconUpload()   { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>; }
function IconHistory()  { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function IconChart()    { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconReport()   { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>; }
function IconHelp()     { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconSettings() { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IconSignOut()  { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IconTeam()     { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconAdmin()    { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IconPlus()     { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>; }
