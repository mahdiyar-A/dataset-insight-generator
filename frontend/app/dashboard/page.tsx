// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import UploadCard from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import HistoryCard from "@/components/historyCard";
import ChartsCard from "@/components/chartsCard";
import DownloadsCard from "@/components/downloadCard";
import InfoCards from "@/components/infoCards";

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("top");
  const router = useRouter();
  const { logout, user } = useAuth();

  const topRef      = useRef(null);
  const uploadRef   = useRef(null);
  const historyRef  = useRef(null);
  const chartsRef   = useRef(null);
  const downloadRef = useRef(null);
  const helpRef     = useRef(null);

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

  const handleSignOut = () => { logout(); router.push("/login"); };

  const avatarLetter = user?.userName?.charAt(0)?.toUpperCase() ?? "U";
  const displayName  = user?.userName ?? "User";

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
        {/* Logo */}
        <div className="sidebar-logo-wrap">
          <img src="/d_dig.svg" alt="DIG" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>

        {/* Nav */}
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

        {/* Bottom */}
        <div className="sidebar-bottom">
          <button
            className="sidebar-link"
            onClick={() => router.push("/dashboard/settings")}
            title="Settings"
          >
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
            <p className="subtitle">Upload a dataset to generate instant insights.</p>
          </div>
          <div className="topbar-right">
            <div className="profile-wrapper">
              <div className="avatar">{avatarLetter}</div>
              <div className="profile-text">
                <span className="profile-name">{displayName}</span>
                <span className="profile-role">Member</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown">
                <a href="/dashboard/profileEditor">View profile</a>
                <a href="/dashboard/accountSettings">Account settings</a>
              </div>
            </div>
          </div>
        </header>

        {/* 1. Upload + Assistant side by side */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard />
          <AnalysisAssistantCard />
        </section>

        {/* 2. Dataset history */}
        <section className="dataset-management-grid" id="section-history" ref={historyRef}>
          <HistoryCard />
        </section>

        {/* 3. Visualizations — BELOW history */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard />
        </section>

        {/* 4. Report & Exports */}
        <section id="section-download" ref={downloadRef}>
          <DownloadsCard />
        </section>

        {/* 5. Help + Contact */}
        <section id="section-help" ref={helpRef}>
          <InfoCards />
        </section>

      </div>
    </div>
  );
}

/* ── SVG Icons (replacing emoji for cleaner sidebar) ── */
function IconGrid() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
function IconReport() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
    </svg>
  );
}
function IconHelp() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );

}