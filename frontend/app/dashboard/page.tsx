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
  // Active sidebar link
  const [activeSection, setActiveSection] = useState("top");

  // Refs for each section
  const router = useRouter();
  const { logout, currentUser } = useAuth();
  const topRef = useRef(null);
  const uploadRef = useRef(null);
  const historyRef = useRef(null);
  const chartsRef = useRef(null);
  const downloadRef = useRef(null);
  const helpRef = useRef(null);

  // IntersectionObserver for scroll highlighting
  useEffect(() => {
    const sections = [
      { id: "top", ref: topRef },
      { id: "section-upload", ref: uploadRef },
      { id: "section-history", ref: historyRef },
      { id: "section-charts", ref: chartsRef },
      { id: "section-download", ref: downloadRef },
      { id: "section-help", ref: helpRef },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root: null, rootMargin: "0px", threshold: 0.6 }
    );

    sections.forEach((s) => {
      if (s.ref.current) observer.observe(s.ref.current);
    });

    return () => observer.disconnect();
  }, []);

  // Scroll to section
  const scrollToSection = (id, ref) => {
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
    }
  };

  // New dataset button
  const handleNewDataset = async () => {
    try {
      const response = await fetch("/api/datasets/new", { method: "POST" });
      if (!response.ok) throw new Error("Failed to create new dataset");
      alert("New dataset created (mock)");
    } catch (err) {
      console.error(err);
      alert("Error creating new dataset");
    }
  };

  const handleSignOut = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="dig-body">
      {/* Sidebar */}
      <aside className="dig-sidebar">
        <div className="brand">
          <img src="DIG.png" alt="DIG logo" className="logo" />
          <span className="brand-name">
            Dataset Insight <br /> Generator
          </span>
        </div>
        <nav>
          <a
            className={activeSection === "top" ? "active" : ""}
            onClick={() => scrollToSection("top", topRef)}
          >
            Dashboard
          </a>
          <a
            className={activeSection === "section-upload" ? "active" : ""}
            onClick={() => scrollToSection("section-upload", uploadRef)}
          >
            Upload
          </a>
          <a
            className={activeSection === "section-history" ? "active" : ""}
            onClick={() => scrollToSection("section-history", historyRef)}
          >
            History / Analysis
          </a>
          <a
            className={activeSection === "section-charts" ? "active" : ""}
            onClick={() => scrollToSection("section-charts", chartsRef)}
          >
            AI Insights
          </a>
          <a
            className={activeSection === "section-download" ? "active" : ""}
            onClick={() => scrollToSection("section-download", downloadRef)}
          >
            Report & Exports
          </a>
          <a
            className={activeSection === "section-help" ? "active" : ""}
            onClick={() => scrollToSection("section-help", helpRef)}
          >
            Help & Support
          </a>
          
        </nav>
      </aside>

      {/* Main content */}
      <div className="dig-main">
        {/* Top bar */}
        <header className="dig-topbar" ref={topRef}>
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Upload a dataset to generate instant insights.
            </p>
          </div>

          <div className="topbar-right">
            <button className="primary-btn" onClick={handleNewDataset}>
              New Dataset
            </button>
            <div className="profile-wrapper">
              <div className="avatar">M</div>
              <div className="profile-text">
                <span className="profile-name">Mahdiyar (mock)</span>
                <span className="profile-role">Guest user</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown">
                <a href="/dashboard/profileEditor">View profile</a>
                <a href="#section-analysis">History</a>
                <a href="/dashboard/accountSettings">Account settings</a>
                <a onClick={handleSignOut} style={{ cursor: 'pointer' }}>Sign out</a>              </div>
            </div>
          </div>
        </header>

        {/* Upper grid: Upload + AI Assistant */}
        <section
          className="upper-grid"
          id="section-upload"
          ref={uploadRef}
        >
          <UploadCard />
          <AnalysisAssistantCard />
        </section>

        {/* History section */}
        <section
          className="dataset-management-grid"
          id="section-history"
          ref={historyRef}
        >
          <HistoryCard />
        </section>

        {/* Charts section */}
        <section
          className="charts-grid"
          id="section-charts"
          ref={chartsRef}
        >
          <ChartsCard />
        </section>

        {/* Download / Report card */}
        <section
          className="charts-grid"
          id="section-download"
          ref={downloadRef}
        >
          <DownloadsCard />
        </section>

        {/* Info / Help cards */}
        <section
          className="charts-grid"
          id="section-help"
          ref={helpRef}
        >
          <InfoCards />
        </section>
      </div>
    </div>
  );
}
