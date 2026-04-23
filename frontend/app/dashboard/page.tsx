// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";
import UploadCard from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import HistoryCard from "@/components/historyCard";
import ChartsCard from "@/components/chartsCard";
import DownloadsCard from "@/components/downloadCard";
import InfoCards from "@/components/infoCards";
// ── Dashboard translations ────────────────────────────────────────────────────
const DASH_T = {
  en: {
    title: "Dashboard",
    noDataset: "Upload a dataset to get started.",
    lastUpload: (name, rows) => `Last upload: ${name} · ${rows ?? "?"} rows`,
    nav: { dashboard: "Dashboard", upload: "Upload", history: "History", charts: "AI Insights", report: "Report", help: "Help", settings: "Settings", signOut: "Sign out" },
    profile: { view: "View profile", account: "Account settings", memberSince: (d) => `Member since ${d}` },
    bannerDone: "Analysis complete — report, charts, and cleaned dataset are ready.",
    bannerRunning: "Analysis running — charts and report will appear when done…",
    bannerFailed: "Analysis failed. Please try uploading your dataset again.",
    viewReport: "View Report →",
  },
  fr: {
    title: "Tableau de bord",
    noDataset: "Importez un dataset pour commencer.",
    lastUpload: (name, rows) => `Dernier import : ${name} · ${rows ?? "?"} lignes`,
    nav: { dashboard: "Tableau de bord", upload: "Import", history: "Historique", charts: "Insights IA", report: "Rapport", help: "Aide", settings: "Paramètres", signOut: "Déconnexion" },
    profile: { view: "Voir le profil", account: "Paramètres du compte", memberSince: (d) => `Membre depuis ${d}` },
    bannerDone: "Analyse terminée — rapport, graphiques et dataset nettoyé sont prêts.",
    bannerRunning: "Analyse en cours — graphiques et rapport apparaîtront bientôt…",
    bannerFailed: "Analyse échouée. Veuillez réimporter votre dataset.",
    viewReport: "Voir le rapport →",
  },
  fa: {
    title: "داشبورد",
    noDataset: "یک دیتاست آپلود کنید تا شروع شود.",
    lastUpload: (name, rows) => `آخرین آپلود: ${name} · ${rows ?? "?"} ردیف`,
    nav: { dashboard: "داشبورد", upload: "آپلود", history: "تاریخچه", charts: "تحلیل‌های AI", report: "گزارش", help: "راهنما", settings: "تنظیمات", signOut: "خروج" },
    profile: { view: "مشاهده پروفایل", account: "تنظیمات حساب", memberSince: (d) => `عضو از ${d}` },
    bannerDone: "تحلیل کامل شد — گزارش، نمودارها و دیتاست پاکسازی‌شده آماده است.",
    bannerRunning: "تحلیل در حال اجرا — نمودارها و گزارش به زودی نمایش می‌یابند…",
    bannerFailed: "تحلیل ناموفق بود. لطفاً دیتاست خود را دوباره آپلود کنید.",
    viewReport: "← مشاهده گزارش",
  },
};

/*
  FULL CYCLE:
  1. Login       → loadDataset() pulls existing dataset + charts + report → shown in all cards
  2. New upload  → loadDataset() called by UploadCard → all cards refresh, chatbot resets to idle
  3. Start analy → chatbot sends "start_analysis" → backend sets status="processing" → polling starts
  4. Yes/No      → chatbot sends "yes"/"no" → backend pipeline runs (AI step, ignored for now)
  5. Polling     → every 10s checks status → when "done" → full reload → all cards fill with new data
  6. Delete      → clears all state → cards show empty state
  7. Next login  → step 1 again, data persists in DB
*/

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("top");
  const router = useRouter();
  const { logout, user: currentUser, token, refreshUser, isLoading } = useAuth();
  const { lang, brightness } = useSettings();
  const t = DASH_T[lang] || DASH_T.en;
  const isLight = brightness > 65;
  const rtl = lang === "fa";

  // ── Auth guard — wait for session to load before redirecting ─────────
  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login');
    }
  }, [token, isLoading]);

  // Block browser back button from leaving the dashboard to an unauthed page.
  // Strategy: on mount push a sentinel entry, then on popstate (back/forward) re-push
  // and redirect to login. This avoids the Next.js router conflict of the old approach.
  useEffect(() => {
    // Push a sentinel so there's always something to pop back to
    window.history.pushState({ dashboard: true }, "");

    const handlePopState = (e: PopStateEvent) => {
      // If the user navigated back OUT of the dashboard sentinel, send them to login
      if (!e.state?.dashboard) {
        router.replace("/login");
      } else {
        // Re-push so the next back press is also caught
        window.history.pushState({ dashboard: true }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  const handleSignOut = () => { logout(); router.push("/"); };

  const [dataset,          setDataset]          = useState(null);
  const [datasetStatus,    setDatasetStatus]    = useState(null);
  const [reportReady,      setReportReady]      = useState(false);
  const [hasPdfReport,     setHasPdfReport]     = useState(false);
  const [analysisKey,      setAnalysisKey]      = useState(0);
  const [uploadResetKey,   setUploadResetKey]   = useState(0);

  const topRef      = useRef(null);
  const uploadRef   = useRef(null);
  const historyRef  = useRef(null);
  const chartsRef   = useRef(null);
  const downloadRef = useRef(null);
  const helpRef     = useRef(null);
  const pollRef     = useRef(null);

  // ── On login: pull profile + existing dataset from DB ──────────────────
  useEffect(() => {
    if (!token) return;
    refreshUser();
    loadDataset();
  }, [token]);

  // Case 1: On login — pull completed dataset from DB
  // Only returns data if a previous analysis succeeded
  // Temp uploads are NOT in DB and won't appear here
  const loadDataset = useCallback(async () => {
    if (!token) return;
    stopPolling();
    try {
      const data = await BackendAPI.getCurrentDataset(token);
      setDataset(data);

      if (!data) {
        setDatasetStatus(null);
        setReportReady(false);
        return;
      }

      const status = data.status ?? "pending";
      setDatasetStatus(status);
      setHasPdfReport(data.hasPdfReport === true);
      // NOTE: reportReady stays false on initial load — only set true when analysis completes THIS session

      // Don't resurface a failed status from a previous session
      // Only show failed if it just happened this session (polling detected it)
      if (status === "failed") {
        setDatasetStatus(null);
        return;
      }

      // Resume polling if analysis was already running when user logged in / refreshed
      if (status === "processing" || status === "pending") {
        startPolling();
      }
    } catch {
      setDataset(null);
      setDatasetStatus(null);
      setReportReady(false);
    }
  }, [token]);

  // Called by UploadCard after temp upload succeeds
  // isPending=true — NOT in DB, do NOT show in HistoryCard
  // Only store as tempMeta so chatbot knows file name/size for greeting
  const handleUploadSuccess = useCallback(async (tempMeta) => {
    stopPolling();
    setDataset({ ...tempMeta, isPending: true });
    setDatasetStatus("pending");
    setReportReady(false);   // reset banner on new upload
    setHasPdfReport(false);
    setAnalysisKey(k => k + 1);
  }, []);

  // ── Called by AnalysisChatCard when user confirms analysis (Yes/No sent) ─
  // Backend already set status="processing" — just start polling
  const handleAnalysisStarted = useCallback(() => {
    setDatasetStatus("processing");
    startPolling();
  }, []);

  // ── Poll /api/datasets/current/status every 10s ─────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already running
    pollRef.current = setInterval(async () => {
      try {
        const s = await BackendAPI.getDatasetStatus(token);
        if (!s) return;
        setDatasetStatus(s.status);

        if (s.status === "done" || s.status === "failed") {
          stopPolling();
          const updated = await BackendAPI.getCurrentDataset(token);
          setDataset(updated);
          if (updated?.hasPdfReport) {
            setReportReady(true);   // show green banner — analysis just finished THIS session
            setHasPdfReport(true);
          }
          setAnalysisKey(k => k + 1);
          setUploadResetKey(k => k + 1);
        }
      } catch { /* network blip — keep polling */ }
    }, 10_000);
  }, [token]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ── Called by HistoryCard delete button ──────────────────────────────────
  const handleDelete = useCallback(() => {
    stopPolling();
    setDataset(null);
    setDatasetStatus(null);
    setReportReady(false);
    setAnalysisKey(k => k + 1);
  }, []);

  useEffect(() => () => stopPolling(), []);

  // ── Intersection observer → sidebar highlight ───────────────────────────
  useEffect(() => {
    const sections = [
      { id: "top",              ref: topRef },
      { id: "section-upload",   ref: uploadRef },
      { id: "section-history",  ref: historyRef },
      { id: "section-charts",   ref: chartsRef },
      { id: "section-download", ref: downloadRef },
      { id: "section-help",     ref: helpRef },
    ];
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); }),
      { threshold: 0.3 }
    );
    sections.forEach((s) => { if (s.ref.current) observer.observe(s.ref.current); });
    return () => observer.disconnect();
  }, []);

  const scrollTo      = (id, ref) => { ref?.current?.scrollIntoView({ behavior: "smooth" }); setActiveSection(id); };
  const scrollToReport = () => scrollTo("section-download", downloadRef);

  // ── User display ─────────────────────────────────────────────────────────
  const firstName    = currentUser?.firstName ?? "";
  const lastName     = currentUser?.lastName  ?? "";
  const fullName     = `${firstName} ${lastName}`.trim();
  const displayName  = fullName || currentUser?.userName || "User";
  const avatarLetter = (firstName?.charAt(0) || currentUser?.userName?.charAt(0) || "U").toUpperCase();
  const avatarUrl    = currentUser?.profilePicture ?? null;
  const memberSince  = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString("en-CA", { month: "short", year: "numeric" })
    : null;

  const navItems = [
    { id: "top",              label: t.nav.dashboard, icon: <IconGrid />,    ref: topRef },
    { id: "section-upload",   label: t.nav.upload,    icon: <IconUpload />,  ref: uploadRef },
    { id: "section-history",  label: t.nav.history,   icon: <IconHistory />, ref: historyRef },
    { id: "section-charts",   label: t.nav.charts,    icon: <IconChart />,   ref: chartsRef },
    { id: "section-download", label: t.nav.report,    icon: <IconReport />,  ref: downloadRef },
    { id: "section-help",     label: t.nav.help,      icon: <IconHelp />,    ref: helpRef },
  ];

  const showProcessingBanner = (datasetStatus === "processing" || datasetStatus === "pending") && !reportReady && !!dataset;
  const showFailedBanner     = datasetStatus === "failed";

  if (isLoading) return null;
  if (!token) return null;

  return (
    <div className="dig-body" style={{ display: "flex", minHeight: "100vh", width: "100%", direction: rtl ? "rtl" : "ltr" }}>

      {/* ── SIDEBAR ── */}
      <aside className="dig-sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/d_dig.svg" alt="DIG" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.id} className={`sidebar-link ${activeSection === item.id ? "active" : ""}`}
              onClick={() => scrollTo(item.id, item.ref)} title={item.label}>
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={() => router.push("/dashboard/settings")} title={t.nav.settings}>
            <span className="sidebar-icon"><IconSettings /></span>
            <span className="sidebar-label">{t.nav.settings}</span>
          </button>
          <button className="sidebar-link" onClick={handleSignOut} title={t.nav.signOut}>
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
              {dataset
                ? t.lastUpload(dataset.fileName, dataset.rowCount)
                : t.noDataset}
            </p>
          </div>

          <div className="topbar-right">
            <div className="profile-wrapper">
              <div className="avatar" style={{ ...(avatarUrl ? { padding:0, overflow:"hidden" } : {}), cursor:"pointer" }}
                onClick={() => router.push("/dashboard/profileView")}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : avatarLetter}
              </div>
              <div className="profile-text" style={{ cursor:"pointer" }} onClick={() => router.push("/dashboard/profileView")}>
                <span className="profile-name">{displayName}</span>
                <span className="profile-role">{memberSince ? t.profile.memberSince(memberSince) : "Member"}</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown">
                <a onClick={(e) => { e.preventDefault(); router.push("/dashboard/profileView"); }}>{t.profile.view}</a>
                <a onClick={(e) => { e.preventDefault(); router.push("/dashboard/editProfile"); }}>{t.profile.account}</a>
              </div>
            </div>
          </div>
        </header>

        {/* ── Banners ── */}
        {reportReady && (
          <div style={{ padding:"12px 24px", background: isLight ? "rgba(22,163,74,0.08)" : "linear-gradient(90deg,rgba(22,163,74,0.12),rgba(22,163,74,0.06))", borderBottom:"1px solid rgba(34,197,94,0.3)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <span>✅</span>
              <span style={{ fontSize:"0.85rem", color: isLight ? "#15803d" : "#bbf7d0", fontWeight:600 }}>
                {t.bannerDone}
              </span>
            </div>
            <button onClick={scrollToReport} style={{ padding:"7px 16px", borderRadius:"999px", border: isLight ? "1px solid rgba(22,163,74,0.5)" : "1px solid rgba(34,197,94,0.4)", background: isLight ? "rgba(22,163,74,0.1)" : "rgba(22,163,74,0.15)", color: isLight ? "#15803d" : "#86efac", fontSize:"0.78rem", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
              {t.viewReport}
            </button>
          </div>
        )}

        {showProcessingBanner && (
          <div style={{ padding:"12px 24px", background: isLight ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.08)", borderBottom:"1px solid rgba(37,99,235,0.2)", display:"flex", alignItems:"center", gap:"10px" }}>
            <span>⏳</span>
            <span style={{ fontSize:"0.85rem", color: isLight ? "#1d4ed8" : "#93c5fd" }}>
              {t.bannerRunning}
            </span>
          </div>
        )}

        {showFailedBanner && (
          <div style={{ padding:"12px 24px", background: isLight ? "rgba(220,38,38,0.06)" : "rgba(127,29,29,0.12)", borderBottom:"1px solid rgba(249,115,115,0.2)", display:"flex", alignItems:"center", gap:"10px" }}>
            <span>❌</span>
            <span style={{ fontSize:"0.85rem", color: isLight ? "#b91c1c" : "#fca5a5" }}>
              {t.bannerFailed}
            </span>
          </div>
        )}

        {/* 1. Upload + Chatbot */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard onUploadSuccess={handleUploadSuccess} resetKey={uploadResetKey} />
          <AnalysisAssistantCard
            key={analysisKey}
            dataset={dataset}
            reportReady={reportReady}
            onViewReport={scrollToReport}
            onAnalysisStarted={handleAnalysisStarted}
          />
        </section>

        {/* 2. Dataset history */}
        <section className="dataset-management-grid" id="section-history" ref={historyRef}>
          <HistoryCard dataset={dataset} onDelete={handleDelete} />
        </section>

        {/* 3. Charts */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard dataset={dataset} />
        </section>

        {/* 4. Report */}
        <section id="section-download" ref={downloadRef}>
          <DownloadsCard dataset={dataset ? { ...dataset, hasPdfReport: hasPdfReport } : null} />
        </section>

        {/* 5. Help */}
        <section id="section-help" ref={helpRef}>
          <InfoCards />
        </section>

      </div>
    </div>
  );
}

function IconGrid()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IconUpload()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>; }
function IconHistory()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function IconChart()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconReport()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>; }
function IconHelp()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconSettings() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IconSignOut()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }