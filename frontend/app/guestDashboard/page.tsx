// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import UploadCard            from "@/components/UploadCard";
import AnalysisAssistantCard from "@/components/AnalysisChatCard";
import ChartsCard            from "@/components/chartsCard";
import InfoCards             from "@/components/infoCards";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

const REPORT_SECTIONS = [
  { emoji: "📊", title: "Data Overview",         desc: "Row/column counts, data types, and a plain-language summary of your dataset." },
  { emoji: "🔍", title: "Data Quality Analysis", desc: "Missing values, duplicates, and anomalies found — and how each was handled." },
  { emoji: "📈", title: "Statistical Insights",  desc: "Distributions, outliers, skewness, and correlations with charts and explanations." },
  { emoji: "🤖", title: "AI Commentary",         desc: "Natural language interpretation of patterns and trends written by the assistant." },
  { emoji: "🧹", title: "Cleaning Log",          desc: "Every transformation applied — dropped rows, filled nulls, renamed columns." },
  { emoji: "📉", title: "Visualizations",        desc: "All charts embedded with captions: bar charts, heatmaps, scatter plots, trend lines." },
];

function PDFModal({ reportFileName, pdfUrl, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(2,6,23,0.8)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#020617", border:"1px solid rgba(31,41,55,0.9)", borderRadius:"18px", padding:"16px", width:"min(1000px, 95vw)", height:"min(85vh, 900px)", display:"flex", flexDirection:"column", gap:"12px", boxShadow:"0 24px 60px rgba(0,0,0,0.6)", overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <div style={{ width:"38px", height:"38px", borderRadius:"8px", background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.6">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin:0, fontSize:"0.95rem", fontWeight:700, color:"#e5e7eb" }}>{reportFileName}</h3>
              <p className="muted-small" style={{ marginTop:"2px" }}>Live report preview</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(15,23,42,0.9)", border:"1px solid rgba(55,65,81,0.8)", borderRadius:"8px", padding:"7px", color:"#6b7280", cursor:"pointer", display:"flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style={{ flex:1, borderRadius:"12px", overflow:"hidden", border:"1px solid rgba(31,41,55,0.8)" }}>
          <iframe title="PDF preview" src={pdfUrl} style={{ width:"100%", height:"100%", border:0, background:"#fff" }}/>
        </div>
        <p className="muted-small" style={{ textAlign:"center", margin:0 }}>If the preview doesn&apos;t load, use &quot;Download PDF Report&quot;.</p>
      </div>
    </div>
  );
}

// Stable guest session ID for this browser tab
function getGuestSessionId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = sessionStorage.getItem("dig_guest_session");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("dig_guest_session", id); }
  return id;
}

// ── Guest-specific BackendAPI — takes sessionId as parameter ─────────────
function makeGuestAPI(sessionId) {
  return {
    async uploadDataset(file, rowCount, columnCount) {
      const form = new FormData();
      form.append("file",       file);
      form.append("sessionId",  sessionId);
      form.append("rows",       String(rowCount));
      form.append("columns",    String(columnCount));
      const res = await fetch(`${API_BASE}/api/guest/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    },

    async sendChatMessage(message, meta = {}) {
      const res = await fetch(`${API_BASE}/api/guest/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          fileName:         meta.fileName         ?? null,
          fileSizeBytes:    meta.fileSizeBytes     ?? null,
          rowCount:         meta.rowCount          ?? null,
          columnCount:      meta.columnCount       ?? null,
          pendingCondition: meta.pendingCondition  ?? null,
        }),
      });
      if (!res.ok) throw new Error("Chat failed");
      return await res.json();
    },

    async getStatus() {
      const res = await fetch(`${API_BASE}/api/guest/status/${sessionId}`);
      if (!res.ok) throw new Error("Status check failed");
      return await res.json();
    },
  };
}

export default function GuestDashboardPage() {
  const router = useRouter();

  // ── Fresh session ID on every page mount — clears previous guest interaction ──
  const [sessionId, setSessionId] = useState(() => {
    const id = crypto.randomUUID();
    if (typeof window !== "undefined") sessionStorage.setItem("dig_guest_session", id);
    return id;
  });

  // ── State ────────────────────────────────────────────────────────────
  const [dataset,        setDataset]        = useState(null);
  const [reportReady,    setReportReady]     = useState(false);
  const [pdfBase64,      setPdfBase64]       = useState(null);
  const [cleanedCsvB64,  setCleanedCsvB64]   = useState(null);
  const [charts,         setCharts]          = useState([]);
  const [analysisKey,    setAnalysisKey]     = useState(0);
  const [uploadResetKey, setUploadResetKey]  = useState(0);
  const [activeSection,  setActiveSection]   = useState("top");
  const [showPdfModal,   setShowPdfModal]    = useState(false);
  const [pdfBlobUrl,     setPdfBlobUrl]      = useState(null);
  const [pdfLoading,     setPdfLoading]      = useState(false);
  const pollingRef = useRef(null);

  // ── GuestAPI bound to this session's ID ──────────────────────────────
  const GuestAPI = useMemo(() => makeGuestAPI(sessionId), [sessionId]);

  // ── Refs ─────────────────────────────────────────────────────────────
  const topRef      = useRef(null);
  const uploadRef   = useRef(null);
  const historyRef  = useRef(null);
  const chartsRef   = useRef(null);
  const downloadRef = useRef(null);
  const helpRef     = useRef(null);

  // ── Reset all state on every fresh mount ─────────────────────────────
  useEffect(() => {
    setDataset(null);
    setReportReady(false);
    setPdfBase64(null);
    setCleanedCsvB64(null);
    setCharts([]);
    setAnalysisKey(0);
    setUploadResetKey(k => k + 1);
    stopPolling();
  }, []); // runs once on mount

  // ── Block browser back button — redirect to landing ──────────────────
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      router.push("/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── Intersection observer for sidebar active state ───────────────────
  useEffect(() => {
    const sections = [
      { id: "top",              ref: topRef },
      { id: "section-upload",   ref: uploadRef },
      { id: "section-history",  ref: historyRef },
      { id: "section-charts",   ref: chartsRef },
      { id: "section-download", ref: downloadRef },
      { id: "section-help",     ref: helpRef },
    ];
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }),
      { threshold: 0.3 }
    );
    sections.forEach(s => s.ref.current && obs.observe(s.ref.current));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id, ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth" });
    setActiveSection(id);
  };

  // ── Polling ───────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const s = await GuestAPI.getStatus();
        if (s.status === "done" || s.status === "failed") {
          stopPolling();
          if (s.status === "done") {
            setPdfBase64(s.pdfReportBase64   ?? null);
            setCleanedCsvB64(s.cleanedCsvBase64 ?? null);
            setCharts(s.charts ?? []);
            setReportReady(true);
            setDataset(prev => prev ? { ...prev, status: "done", isPending: false, hasPdfReport: !!s.pdfReportBase64, hasCleanedCsv: !!s.cleanedCsvBase64 } : prev);
          }
          // Only bump analysisKey to reset chatbot — don't reset upload card
          setAnalysisKey(k => k + 1);
        }
      } catch { /* polling errors are non-fatal */ }
    }, 8000);
  }, [stopPolling, GuestAPI]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Upload success ────────────────────────────────────────────────────
  const handleUploadSuccess = useCallback((meta) => {
    setDataset({ ...meta, isPending: true, status: "pending" });
    setReportReady(false);
    setPdfBase64(null);
    setCleanedCsvB64(null);
    setCharts([]);
  }, []);

  // ── Analysis started (chatbot fired yes/no) ───────────────────────────
  const handleAnalysisStarted = useCallback(() => {
    setDataset(prev => prev ? { ...prev, status: "processing" } : prev);
    startPolling();
  }, [startPolling]);

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    stopPolling();
    setDataset(null);
    setReportReady(false);
    setPdfBase64(null);
    setCleanedCsvB64(null);
    setCharts([]);
    setAnalysisKey(k => k + 1);
    setUploadResetKey(k => k + 1);
    scrollTo("section-upload", uploadRef);
  }, [stopPolling]);

  // ── Download helpers (from memory — no Supabase) ──────────────────────
  const reportFileName = dataset?.fileName ? `dig_report_${dataset.fileName}.pdf` : "analysis_report.pdf";

  const downloadPdf = () => {
    if (!pdfBase64) return;
    const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: reportFileName,
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleViewPdf = () => {
    if (!pdfBase64) return;
    setPdfLoading(true);
    const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const url   = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    setShowPdfModal(true);
    setPdfLoading(false);
  };

  const handleClosePdf = () => {
    setShowPdfModal(false);
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); }
  };

  const downloadCleanedCsv = () => {
    if (!cleanedCsvB64) return;
    const bytes = Uint8Array.from(atob(cleanedCsvB64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `cleaned_${dataset?.fileName ?? "dataset.csv"}`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const scrollToReport = () => scrollTo("section-download", downloadRef);

  // ── Nav items ─────────────────────────────────────────────────────────
  const navItems = [
    { id: "top",              label: "Dashboard",   icon: <IconGrid />,    ref: topRef },
    { id: "section-upload",   label: "Upload",      icon: <IconUpload />,  ref: uploadRef },
    { id: "section-history",  label: "History",     icon: <IconHistory />, ref: historyRef },
    { id: "section-charts",   label: "AI Insights", icon: <IconChart />,   ref: chartsRef },
    { id: "section-download", label: "Report",      icon: <IconReport />,  ref: downloadRef },
    { id: "section-help",     label: "Help",        icon: <IconHelp />,    ref: helpRef },
  ];

  const showDataset = dataset && !dataset.isPending && dataset.status === "done";

  return (
    <>
    {showPdfModal && pdfBlobUrl && (
      <PDFModal reportFileName={reportFileName} pdfUrl={pdfBlobUrl} onClose={handleClosePdf} />
    )}
    <div className="dig-body" style={{ display: "flex", minHeight: "100vh", width: "100%" }}>

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
          <button className="sidebar-link" onClick={() => router.push("/login")} title="Log in">
            <span className="sidebar-icon"><IconSignIn /></span>
            <span className="sidebar-label">Log in</span>
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
                ? `${dataset.fileName} · ${dataset.rowCount} rows · ${dataset.columnCount} columns`
                : "Upload a dataset to generate instant insights."}
            </p>
          </div>
          <div className="topbar-right">
            <div className="profile-wrapper">
              <div className="avatar" style={{ background: "linear-gradient(135deg, #78350f, #92400e)", color: "#fbbf24", fontSize: "0.85rem", fontWeight: 800 }}>G</div>
              <div className="profile-text">
                <span className="profile-name">Guest</span>
                <span className="profile-role">Guest session</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              <div className="profile-dropdown" style={{ minWidth: "210px" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(31,41,55,0.8)", cursor: "default" }}>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", lineHeight: 1.6 }}>
                    You're browsing as a guest.<br />Your session is not saved.
                  </p>
                </div>
                <a onClick={() => router.push("/register")} style={{ cursor: "pointer", color: "#93c5fd", fontWeight: 600 }}>Create free account →</a>
                <a onClick={() => router.push("/login")}    style={{ cursor: "pointer" }}>Log in to existing account</a>
              </div>
            </div>
          </div>
        </header>

        {/* Guest notice bar */}
        <div style={{ padding: "9px 24px", background: "rgba(120,53,15,0.12)", borderBottom: "1px solid rgba(180,83,9,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ fontSize: "0.79rem", color: "#fbbf24" }}>👤 Guest session — all data is lost when you close this tab.</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => router.push("/register")} style={{ padding: "5px 14px", borderRadius: "999px", border: "1px solid rgba(37,99,235,0.4)", background: "rgba(37,99,235,0.12)", color: "#93c5fd", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" }}>Sign up free</button>
            <button onClick={() => router.push("/login")}    style={{ padding: "5px 12px", borderRadius: "999px", border: "1px solid rgba(55,65,81,0.5)", background: "transparent", color: "#6b7280", fontSize: "0.74rem", cursor: "pointer" }}>Log in</button>
          </div>
        </div>

        {/* Report-ready banner */}
        {reportReady && (
          <div style={{ padding: "12px 24px", background: "linear-gradient(90deg, rgba(22,163,74,0.12), rgba(22,163,74,0.06))", borderBottom: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontSize: "0.85rem", color: "#bbf7d0", fontWeight: 600 }}>✅ Analysis complete — your report is ready.</span>
            <button onClick={scrollToReport} style={{ padding: "6px 16px", borderRadius: "999px", border: "1px solid rgba(34,197,94,0.4)", background: "rgba(22,163,74,0.15)", color: "#86efac", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>View Report →</button>
          </div>
        )}

        {/* ── Upload + Chatbot ── */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>
          <UploadCard
            onUploadSuccess={handleUploadSuccess}
            resetKey={uploadResetKey}
            guestMode={true}
            guestSessionId={sessionId}
          />
          <AnalysisAssistantCard
            key={analysisKey}
            dataset={dataset}
            reportReady={reportReady}
            onViewReport={scrollToReport}
            onAnalysisStarted={handleAnalysisStarted}
            guestMode={true}
            guestSessionId={sessionId}
          />
        </section>

        {/* ── Current Dataset table ── */}
        <section className="dataset-management-grid" id="section-history" ref={historyRef}>
          <div className="card table-card">
            <div className="card-header">
              <h2>Current Dataset</h2>
              <span className="pill">{showDataset ? "1 dataset" : "No upload yet"}</span>
            </div>
            <table className="dataset-table">
              <thead>
                <tr><th>Dataset name</th><th>Rows</th><th>Columns</th><th>Size</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {!showDataset ? (
                  <tr>
                    <td><span style={{ color: "#4b5563", fontSize: "0.82rem" }}>No dataset uploaded yet</span></td>
                    <td style={{ color: "#374151" }}>—</td>
                    <td style={{ color: "#374151" }}>—</td>
                    <td style={{ color: "#374151" }}>—</td>
                    <td className="actions-cell">
                      <button className="table-action" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>Download</button>
                      <button className="table-action delete" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>Delete</button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ display: "inline-flex", padding: "4px", background: "rgba(37,99,235,0.12)", borderRadius: "6px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </span>
                        <span style={{ fontWeight: 500, color: "#e5e7eb" }}>{dataset.fileName}</span>
                      </div>
                    </td>
                    <td>{dataset.rowCount}</td>
                    <td>{dataset.columnCount}</td>
                    <td>{dataset.fileSizeBytes ? `${(dataset.fileSizeBytes / 1024).toFixed(1)} KB` : "—"}</td>
                    <td className="actions-cell">
                      <button className="table-action" onClick={downloadPdf} disabled={!pdfBase64} style={{ opacity: pdfBase64 ? 1 : 0.4, borderColor: "rgba(37,99,235,0.35)", color: "#93c5fd" }}>Download</button>
                      <button className="table-action delete" onClick={handleDelete}>Delete</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Charts ── */}
        <section id="section-charts" ref={chartsRef}>
          <ChartsCard charts={charts} reportReady={reportReady} />
        </section>

        {/* ── Report & Exports ── */}
        <section id="section-download" ref={downloadRef}>
          <div className="card analysis-report-card">
            <div className="card-header">
              <h2>Report & Exports</h2>
              <span className="pill" style={reportReady ? { borderColor: "rgba(34,197,94,0.5)", color: "#bbf7d0", background: "rgba(22,163,74,0.1)" } : {}}>
                {reportReady ? "✓ Ready" : "Not started"}
              </span>
            </div>
            <p className="muted-small">
              {reportReady
                ? "Downloads available this session only — sign up to save permanently."
                : "Run analysis to generate your report."}
            </p>

            {/* PDF file row */}
            <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 14px", borderRadius:"12px", background:"rgba(15,23,42,0.9)", border:"1px solid rgba(31,41,55,0.9)" }}>
              <div style={{ width:"38px", height:"38px", borderRadius:"8px", background: reportReady ? "rgba(239,68,68,0.15)" : "rgba(31,41,55,0.8)", border:`1px solid ${reportReady ? "rgba(239,68,68,0.3)" : "rgba(55,65,81,0.8)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={reportReady ? "#f87171" : "#4b5563"} strokeWidth="1.6">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:"0.82rem", fontWeight:600, color: reportReady ? "#e5e7eb" : "#4b5563" }}>{reportFileName}</p>
                <p className="muted-small">{reportReady ? "Ready" : "Pending analysis"}</p>
              </div>
              <button disabled={!reportReady || !pdfBase64 || pdfLoading} onClick={handleViewPdf}
                style={{ background:"rgba(37,99,235,0.12)", border:"1px solid rgba(37,99,235,0.3)", borderRadius:"8px", padding:"6px 12px", color:(!reportReady||!pdfBase64||pdfLoading) ? "#374151" : "#93c5fd", fontSize:"0.75rem", fontWeight:600, cursor:(!reportReady||!pdfBase64||pdfLoading) ? "not-allowed" : "pointer", opacity:(!reportReady||!pdfBase64||pdfLoading) ? 0.45 : 1 }}>
                {pdfLoading ? "Loading…" : "View PDF"}
              </button>
            </div>

            <button className="primary-btn-lg" disabled={!reportReady || !pdfBase64} onClick={downloadPdf}
              style={{ opacity: reportReady && pdfBase64 ? 1 : 0.4, cursor: reportReady && pdfBase64 ? "pointer" : "not-allowed" }}>
              ↓ Download PDF Report — {reportFileName}
            </button>

            <div className="export-buttons">
              <button className="secondary-btn" disabled={!cleanedCsvB64} onClick={downloadCleanedCsv}
                style={{ opacity: cleanedCsvB64 ? 1 : 0.4, cursor: cleanedCsvB64 ? "pointer" : "not-allowed" }}>
                Download cleaned CSV
              </button>
            </div>

            {/* Sign-up upsell */}
            <div style={{ padding: "16px 18px", borderRadius: "14px", background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#bfdbfe", fontSize: "0.85rem" }}>💡 Want to keep your results?</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.78rem" }}>Sign up free to save your dataset, access your report anytime, and keep your history.</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button onClick={() => router.push("/register")} style={{ padding: "8px 18px", borderRadius: "999px", border: "none", background: "linear-gradient(90deg, #2563eb, #4f46e5)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>Create free account</button>
                <button onClick={() => router.push("/login")}    style={{ padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(55,65,81,0.8)", background: "transparent", color: "#9ca3af", fontSize: "0.82rem", cursor: "pointer" }}>Log in</button>
              </div>
            </div>

            {/* What's included */}
            <div style={{ marginTop:"8px" }}>
              <h3 style={{ fontSize:"0.78rem", color:"#6b7280", letterSpacing:"0.05em", textTransform:"uppercase", margin:"0 0 10px 0" }}>
                What&apos;s included in your report
              </h3>
              <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                {REPORT_SECTIONS.map((s,i) => (
                  <div key={i} style={{ display:"flex", gap:"10px", alignItems:"flex-start", padding:"9px 12px", borderRadius:"10px", background:"rgba(15,23,42,0.9)", border:"1px solid rgba(31,41,55,0.8)" }}>
                    <span style={{ fontSize:"15px", flexShrink:0, marginTop:"1px" }}>{s.emoji}</span>
                    <div>
                      <p style={{ margin:0, fontSize:"0.8rem", fontWeight:600, color:"#d1d5db" }}>{s.title}</p>
                      <p className="muted-small" style={{ marginTop:"2px", lineHeight:"1.5" }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Help ── */}
        <section id="section-help" ref={helpRef}>
          <InfoCards />
        </section>

      </div>
    </div>
    </>
  );
}

function IconGrid()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>; }
function IconUpload()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>; }
function IconHistory() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function IconChart()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconReport()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>; }
function IconHelp()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconSignIn()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>; }