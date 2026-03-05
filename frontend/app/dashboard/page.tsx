// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import UploadCard from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import HistoryCard from "@/components/historyCard";
import ChartsCard from "@/components/chartsCard";
import DownloadsCard from "@/components/downloadCard";
import InfoCards from "@/components/infoCards";

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("top");
  const router = useRouter();
  const { logout, currentUser, token, refreshUser } = useAuth();

  // Dataset state — loaded once on mount, shared with child cards via props/context
  const [dataset,       setDataset]       = useState(null);
  const [datasetStatus, setDatasetStatus] = useState(null); // "pending"|"processing"|"done"|"failed"|null
  const [reportReady,   setReportReady]   = useState(false);

  const topRef      = useRef(null);
  const uploadRef   = useRef(null);
  const historyRef  = useRef(null);
  const chartsRef   = useRef(null);
  const downloadRef = useRef(null);
  const helpRef     = useRef(null);
  const pollRef     = useRef(null);

  // ── Load user profile + dataset on mount
  useEffect(() => {
    if (token) {
      refreshUser();
      loadDataset();
    }
  }, [token]);

  const loadDataset = useCallback(async () => {
    if (!token) return;
    try {
      const data = await BackendAPI.getCurrentDataset(token);
      setDataset(data);
      if (data) {
        setReportReady(data.hasPdfReport === true);
        if (!data.hasPdfReport) startPolling();
      }
    } catch { /* no dataset yet */ }
  }, [token]);

  // ── Poll /api/datasets/current/status every 10s while analysis is running
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(async () => {
      try {
        const s = await BackendAPI.getDatasetStatus(token);
        if (!s) return;
        setDatasetStatus(s.status);
        if (s.status === "done" || s.status === "failed") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          // Reload full dataset to get updated URLs
          const updated = await BackendAPI.getCurrentDataset(token);
          setDataset(updated);
          if (updated?.hasPdfReport) setReportReady(true);
        }
      } catch { /* ignore */ }
    }, 10_000);
  }, [token]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Scroll sections
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

  const scrollTo = (id, ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth" });
    setActiveSection(id);
  };

  const scrollToReport = () => scrollTo("section-download", downloadRef);

  const handleSignOut = () => { logout(); router.push("/login"); };

  // User display — from backend via AuthContext
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
    { id: "top",              label: "Dashboard",   icon: <IconGrid />,    ref: topRef },
    { id: "section-upload",   label: "Upload",      icon: <IconUpload />,  ref: uploadRef },
    { id: "section-history",  label: "History",     icon: <IconHistory />, ref: historyRef },
    { id: "section-charts",   label: "AI Insights", icon: <IconChart />,   ref: chartsRef },
    { id: "section-download", label: "Report",      icon: <IconReport />,  ref: downloadRef },
    { id: "section-help",     label: "Help",        icon: <IconHelp />,    ref: helpRef },
  ];

  return (
    <div className="dig-body" style={{ display: "flex", minHeight: "100vh" }}>

      {/* ── SIDEBAR ── */}
      <aside className="dig-sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/d_dig.svg" alt="DIG" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-link ${activeSection === item.id ? "active" : ""}`}
              onClick={() => scrollTo(item.id, item.ref)}
              title={item.label}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={() => router.push("/dashboard/settings")} title="Settings">
            <span className="sidebar-icon"><IconSettings /></span>
            <span className="sidebar-label">Settings</span>
          </button>
          <button className="sidebar-link" onClick={handleSignOut} title="Sign out">
            <span className="sidebar-icon"><IconSignOut /></span>
            <span className="sidebar-label">Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="dig-main">

        {/* Top bar */}
        <header className="dig-topbar" id="top" ref={topRef}>
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              {dataset
                ? `Last upload: ${dataset.fileName} · ${dataset.rowCount ?? "?"} rows`
                : "Upload a dataset to generate instant insights."}
            </p>
          </div>
          <div className="topbar-right">
            <div className="profile-wrapper">
              {/* Avatar */}
              <div className="avatar" style={avatarUrl ? { padding: 0, overflow: "hidden" } : {}}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : avatarLetter}
              </div>
              <div className="profile-text">
                <span className="profile-name">{displayName}</span>
                <span className="profile-role">
                  {memberSince ? `Member since ${memberSince}` : "Member"}
                </span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown">
                <a href="/dashboard/profileView">View profile</a>
                <a href="/dashboard/editProfile">Account settings</a>
              </div>
            </div>
          </div>
        </header>

        {/* Report-ready banner — appears when analysis finishes */}
        {reportReady && (
          <div style={{
            margin: "0 0 0",
            padding: "12px 24px",
            background: "linear-gradient(90deg, rgba(22,163,74,0.12), rgba(22,163,74,0.06))",
            borderBottom: "1px solid rgba(34,197,94,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>✅</span>
              <span style={{ fontSize: "0.85rem", color: "#bbf7d0", fontWeight: 600 }}>
                Your analysis is complete — report and cleaned dataset are ready.
              </span>
            </div>
            <button
              onClick={scrollToReport}
              style={{ padding: "7px 16px", borderRadius: "999px", border: "1px solid rgba(34,197,94,0.4)", background: "rgba(22,163,74,0.15)", color: "#86efac", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              View Report →
            </button>
          </div>
        )}

        {/* Analysis in-progress banner */}
        {datasetStatus === "processing" && !reportReady && (
          <div style={{
            padding: "12px 24px",
            background: "rgba(37,99,235,0.08)",
            borderBottom: "1px solid rgba(37,99,235,0.2)",
            display: "flex", alignItems: "center", gap: "10px"
          }}>
            <span style={{ fontSize: "14px", animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
            <span style={{ fontSize: "0.85rem", color: "#93c5fd" }}>Analysis running — your report will be ready shortly…</span>
          </div>
        )}

        {/* 1. Upload + Assistant */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard onUploadSuccess={loadDataset} />
          <AnalysisAssistantCard reportReady={reportReady} onViewReport={scrollToReport} />
        </section>

        {/* 2. Dataset history */}
        <section className="dataset-management-grid" id="section-history" ref={historyRef}>
          <HistoryCard dataset={dataset} onDelete={() => { setDataset(null); setReportReady(false); }} />
        </section>

        {/* 3. Charts */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard dataset={dataset} />
        </section>

        {/* 4. Report */}
        <section id="section-download" ref={downloadRef}>
          <DownloadsCard dataset={dataset} />
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