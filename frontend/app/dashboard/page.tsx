"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth }    from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI      from "@/lib/BackendAPI";
import type { Analysis, AnalysisStatus, UploadedFileMeta } from "@/lib/types";
import UploadCard      from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import HistoryTape     from "@/components/HistoryTape";
import ChartsCard      from "@/components/chartsCard";
import DownloadsCard   from "@/components/downloadCard";
import InfoCards       from "@/components/infoCards";
import PlanBadge       from "@/components/PlanBadge";

// ── Translations ──────────────────────────────────────────────────────────────
const DASH_T = {
  en: {
    title: "Dashboard",
    subtitle: "Upload a dataset or load from history to get started.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} rows`,
    nav: {
      dashboard: "Dashboard", upload: "Upload", history: "History",
      charts: "AI Insights", report: "Report", help: "Help",
      settings: "Settings", signOut: "Sign out",
      team: "Team", admin: "Admin",
    },
    profile: {
      view: "View profile", account: "Account settings",
      memberSince: (d: string) => `Member since ${d}`,
    },
    bannerDone:    "Analysis complete — report, charts, and cleaned dataset are ready.",
    bannerRunning: "Analysis running — results will appear when done…",
    bannerFailed:  "Analysis failed. Please try uploading your dataset again.",
    viewReport:    "View Report →",
    newSession:    "Start new analysis",
  },
  fr: {
    title: "Tableau de bord",
    subtitle: "Importez un dataset ou chargez depuis l'historique.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} lignes`,
    nav: {
      dashboard: "Tableau de bord", upload: "Import", history: "Historique",
      charts: "Insights IA", report: "Rapport", help: "Aide",
      settings: "Paramètres", signOut: "Déconnexion",
      team: "Équipe", admin: "Admin",
    },
    profile: {
      view: "Voir le profil", account: "Paramètres du compte",
      memberSince: (d: string) => `Membre depuis ${d}`,
    },
    bannerDone:    "Analyse terminée — rapport, graphiques et CSV nettoyé disponibles.",
    bannerRunning: "Analyse en cours — les résultats apparaîtront bientôt…",
    bannerFailed:  "Analyse échouée. Veuillez réimporter votre dataset.",
    viewReport:    "Voir le rapport →",
    newSession:    "Nouvelle analyse",
  },
  fa: {
    title: "داشبورد",
    subtitle: "یک دیتاست آپلود کنید یا از تاریخچه بارگذاری کنید.",
    subtitleActive: (name: string, rows?: number | null) => `${name} · ${rows?.toLocaleString() ?? "?"} ردیف`,
    nav: {
      dashboard: "داشبورد", upload: "آپلود", history: "تاریخچه",
      charts: "تحلیل‌های AI", report: "گزارش", help: "راهنما",
      settings: "تنظیمات", signOut: "خروج",
      team: "تیم", admin: "مدیریت",
    },
    profile: {
      view: "مشاهده پروفایل", account: "تنظیمات حساب",
      memberSince: (d: string) => `عضو از ${d}`,
    },
    bannerDone:    "تحلیل کامل شد — گزارش، نمودارها و CSV پاکسازی‌شده آماده‌اند.",
    bannerRunning: "تحلیل در حال اجرا — نتایج به زودی نمایش می‌یابند…",
    bannerFailed:  "تحلیل ناموفق بود. لطفاً دیتاست خود را دوباره آپلود کنید.",
    viewReport:    "← مشاهده گزارش",
    newSession:    "تحلیل جدید",
  },
};

/*
  DASHBOARD FLOW — v2 (clean-slate model):

  1. Login         → dashboard loads EMPTY. No auto-loaded previous session.
  2. History tab   → user sees last 5 (free) or 15 (pro) completed analyses.
  3. Load history  → user clicks an item → that analysis fills all cards.
  4. New upload    → resets everything → new session starts → chatbot is idle.
  5. Start analy   → chatbot sends "start_analysis" → pipeline runs → polling starts.
  6. Done polling  → all cards fill with new data → analysis added to history.
  7. Delete hist   → item removed from list; if it was the active one, clear dashboard.
*/

export default function DashboardPage() {
  const router  = useRouter();
  const { logout, user, token, refreshUser, isLoading } = useAuth();
  const { lang, brightness } = useSettings();
  const t = DASH_T[lang] || DASH_T.en;

  const isLight = brightness > 65;
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
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // No server id yet — the analysis row is created when the pipeline starts.
    // Marked isPending so the header renders the neutral subtitle.
    setAnalysis({ ...tempMeta, id: "", status: "pending", isPending: true });
    setAnalysisStatus("pending");
    setReportReady(false);
    setHasPdfReport(false);
    setAnalysisKey(k => k + 1);
  }, []);

  // ── Analysis started (chatbot confirmed) ────────────────────────────────────
  const handleAnalysisStarted = useCallback((analysisId: string) => {
    setAnalysisStatus("processing");
    startPolling(analysisId);
  }, []);

  // ── Polling ──────────────────────────────────────────────────────────────────
  const startPolling = useCallback((analysisId: string) => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await BackendAPI.getAnalysisStatus(token, analysisId);
        if (!s) return;
        setAnalysisStatus(s.status);
        if (s.status === "done" || s.status === "failed") {
          stopPolling();
          const updated = await BackendAPI.getAnalysis(token, analysisId);
          setAnalysis(updated);
          if (updated?.hasPdfReport) {
            setReportReady(true);
            setHasPdfReport(true);
          }
          // Refresh history to include the new completed run
          const h = await BackendAPI.getHistory(token);
          setHistory(h ?? []);
          setAnalysisKey(k => k + 1);
          setUploadResetKey(k => k + 1);
        }
      } catch { /* network blip — keep polling */ }
    }, 10_000);
  }, [token]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
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
    setAnalysis(null);
    setAnalysisStatus(null);
    setReportReady(false);
    setHasPdfReport(false);
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

  const navItems = [
    { id: "top",              label: t.nav.dashboard, icon: <IconGrid />,    ref: topRef },
    { id: "section-upload",   label: t.nav.upload,    icon: <IconUpload />,  ref: uploadRef },
    { id: "section-charts",   label: t.nav.charts,    icon: <IconChart />,   ref: chartsRef },
    { id: "section-download", label: t.nav.report,    icon: <IconReport />,  ref: downloadRef },
    { id: "section-help",     label: t.nav.help,      icon: <IconHelp />,    ref: helpRef },
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
          <img src="/d_dig.svg" alt="DIG" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.id}
              className={`sidebar-link ${activeSection === item.id ? "active" : ""}`}
              onClick={() => scrollTo(item.id, item.ref)} title={item.label}>
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {/* Plan badge */}
          <div style={{ padding: "0 8px", marginBottom: "8px" }}>
            <PlanBadge
              plan={plan}
              reportsUsed={user?.reportsUsed ?? 0}
            />
          </div>

          {/* Team link (pro+) */}
          {(plan === "pro" || plan === "admin") && (
            <button className="sidebar-link"
              onClick={() => router.push("/dashboard/team")}
              title={t.nav.team}>
              <span className="sidebar-icon"><IconTeam /></span>
              <span className="sidebar-label">{t.nav.team}</span>
            </button>
          )}

          {/* Admin link */}
          {isAdmin && (
            <button className="sidebar-link"
              onClick={() => router.push("/admin")} title={t.nav.admin}>
              <span className="sidebar-icon"><IconAdmin /></span>
              <span className="sidebar-label">{t.nav.admin}</span>
            </button>
          )}

          <button className="sidebar-link"
            onClick={() => router.push("/dashboard/settings")} title={t.nav.settings}>
            <span className="sidebar-icon"><IconSettings /></span>
            <span className="sidebar-label">{t.nav.settings}</span>
          </button>

          <button className="sidebar-link"
            onClick={() => { logout(); router.push("/"); }} title={t.nav.signOut}>
            <span className="sidebar-icon"><IconSignOut /></span>
            <span className="sidebar-label">{t.nav.signOut}</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="dig-main">

        {/* Topbar */}
        <header className="dig-topbar" id="top" ref={topRef}>
          <div>
            <h1>{t.title}</h1>
            <p className="subtitle">
              {analysis && !analysis.isPending
                ? t.subtitleActive(analysis.fileName, analysis.rowCount ?? undefined)
                : t.subtitle}
            </p>
          </div>

          <div className="topbar-right">
            {/* Start new session button (shown when an analysis is loaded) */}
            {analysis && (
              <button onClick={handleNewSession}
                style={{ padding: "7px 14px", borderRadius: "8px",
                  border: "1px solid rgba(30,41,59,0.7)", background: "transparent",
                  color: "#64748b", fontSize: "0.78rem", cursor: "pointer",
                  marginRight: "12px", fontWeight: 500 }}>
                + {t.newSession}
              </button>
            )}

            {/* Profile */}
            <div className="profile-wrapper">
              <div className="avatar"
                style={{ ...(avatarUrl ? { padding: 0, overflow: "hidden" } : {}), cursor: "pointer" }}
                onClick={() => router.push("/dashboard/profileView")}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : avatarLetter}
              </div>
              <div className="profile-text" style={{ cursor: "pointer" }}
                onClick={() => router.push("/dashboard/profileView")}>
                <span className="profile-name">{displayName}</span>
                <span className="profile-role">
                  {memberSince ? t.profile.memberSince(memberSince) : "Member"}
                </span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown">
                <a onClick={e => { e.preventDefault(); router.push("/dashboard/profileView"); }}>
                  {t.profile.view}
                </a>
                <a onClick={e => { e.preventDefault(); router.push("/dashboard/editProfile"); }}>
                  {t.profile.account}
                </a>
                <a onClick={e => { e.preventDefault(); router.push("/dashboard/plan"); }}>
                  Plan &amp; Billing
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* ── Banners ── */}
        {reportReady && (
          <div style={{ padding: "12px 24px",
            background: isLight ? "rgba(22,163,74,0.08)"
              : "linear-gradient(90deg,rgba(22,163,74,0.12),rgba(22,163,74,0.06))",
            borderBottom: "1px solid rgba(34,197,94,0.3)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>✅</span>
              <span style={{ fontSize: "0.85rem",
                color: isLight ? "#15803d" : "#bbf7d0", fontWeight: 600 }}>
                {t.bannerDone}
              </span>
            </div>
            <button onClick={scrollToReport}
              style={{ padding: "7px 16px", borderRadius: "999px",
                border: isLight ? "1px solid rgba(22,163,74,0.5)"
                  : "1px solid rgba(34,197,94,0.4)",
                background: isLight ? "rgba(22,163,74,0.1)" : "rgba(22,163,74,0.15)",
                color: isLight ? "#15803d" : "#86efac",
                fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
              {t.viewReport}
            </button>
          </div>
        )}

        {showProcessing && (
          <div style={{ padding: "12px 24px",
            background: isLight ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.08)",
            borderBottom: "1px solid rgba(37,99,235,0.2)",
            display: "flex", alignItems: "center", gap: "10px" }}>
            <span>⏳</span>
            <span style={{ fontSize: "0.85rem", color: isLight ? "#1d4ed8" : "#93c5fd" }}>
              {t.bannerRunning}
            </span>
          </div>
        )}

        {showFailed && (
          <div style={{ padding: "12px 24px",
            background: isLight ? "rgba(220,38,38,0.06)" : "rgba(127,29,29,0.12)",
            borderBottom: "1px solid rgba(249,115,115,0.2)",
            display: "flex", alignItems: "center", gap: "10px" }}>
            <span>❌</span>
            <span style={{ fontSize: "0.85rem", color: isLight ? "#b91c1c" : "#fca5a5" }}>
              {t.bannerFailed}
            </span>
          </div>
        )}

        {/* 1. Upload + Chatbot */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard onUploadSuccess={handleUploadSuccess} resetKey={uploadResetKey} />
          <AnalysisAssistantCard
            key={analysisKey}
            dataset={analysis}
            reportReady={reportReady}
            onViewReport={scrollToReport}
            onAnalysisStarted={handleAnalysisStarted}
            plan={plan}
          />
        </section>


        {/* 3. Charts */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard dataset={analysis} />
        </section>

        {/* 4. Report / Downloads */}
        <section id="section-download" ref={downloadRef}>
          <DownloadsCard dataset={analysis
            ? { ...analysis, hasPdfReport: hasPdfReport }
            : null}
          />
        </section>

        {/* 5. Help */}
        <section id="section-help" ref={helpRef}>
          <InfoCards />
        </section>
      </div>

      {/* History tape — pinned outside the scrolling content so it stays
          reachable. A finished analysis lands here rather than replacing what
          is on screen; clicking a card loads it into the dashboard above. */}
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
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconGrid()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IconUpload()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>; }
function IconHistory()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function IconChart()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconReport()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>; }
function IconHelp()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconSettings() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IconSignOut()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IconTeam()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconAdmin()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
