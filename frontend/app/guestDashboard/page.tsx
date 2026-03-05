// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function GuestDashboardPage() {
  const router = useRouter();

  const [file,          setFile]          = useState(null);
  const [csvMeta,       setCsvMeta]       = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [analysisStage, setAnalysisStage] = useState("idle");
  const [reportReady,   setReportReady]   = useState(false);
  const [activeSection, setActiveSection] = useState("top");

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

  const parseCSV = useCallback(async (f) => {
    setUploading(true);
    const text    = await f.text();
    const lines   = text.split("\n").filter(l => l.trim());
    const rows    = Math.max(0, lines.length - 1);
    const cols    = lines[0]?.split(",").length ?? 0;
    const sizeKB  = (f.size / 1024).toFixed(1);
    const headers = lines[0]?.split(",").map(h => h.trim().replace(/^"|"$/g, "")) ?? [];
    const preview = lines.slice(1, 11).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
    setCsvMeta({ rows, columns: cols, sizeKB, headers: headers.slice(0, 10), preview });
    setFile(f);
    setUploading(false);
  }, []);

  const handleFileInput = (e) => { const f = e.target.files?.[0]; if (f) parseCSV(f); };
  const handleDrop      = (e)  => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.name.endsWith(".csv")) parseCSV(f); };

  const runAnalysis = () => {
    setAnalysisStage("running");
    setTimeout(() => {
      setAnalysisStage("done");
      setReportReady(true);
      setTimeout(() => scrollTo("section-download", downloadRef), 400);
    }, 3000);
  };

  const reset = () => {
    setFile(null); setCsvMeta(null);
    setAnalysisStage("idle"); setReportReady(false);
    scrollTo("section-upload", uploadRef);
  };

  const downloadOriginal = () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  };

  const downloadReport = () => {
    const txt = `DIG Guest Report\n\nFile: ${file?.name}\nRows: ${csvMeta?.rows}\nColumns: ${csvMeta?.columns}\nSize: ${csvMeta?.sizeKB} KB\n\nSign up to get a full PDF report and save your results.`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = "dig_guest_report.txt"; a.click();
  };

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

      {/* ── SIDEBAR — pixel-identical to real dashboard ── */}
      <aside className="dig-sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/d_dig.svg" alt="DIG" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">DIG</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.id}
              className={`sidebar-link ${activeSection === item.id ? "active" : ""}`}
              onClick={() => scrollTo(item.id, item.ref)} title={item.label}>
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
          <button className="sidebar-link" onClick={() => router.push("/login")} title="Log in">
            <span className="sidebar-icon"><IconSignIn /></span>
            <span className="sidebar-label">Log in</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="dig-main">

        {/* Top bar — same layout, guest avatar instead of user */}
        <header className="dig-topbar" id="top" ref={topRef}>
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              {csvMeta
                ? `${file?.name} · ${csvMeta.rows} rows · ${csvMeta.columns} columns`
                : "Upload a dataset to generate instant insights."}
            </p>
          </div>
          <div className="topbar-right">
            <div className="profile-wrapper">
              <div className="avatar" style={{ background: "linear-gradient(135deg, #78350f, #92400e)", color: "#fbbf24", fontSize: "0.85rem", fontWeight: 800 }}>
                G
              </div>
              <div className="profile-text">
                <span className="profile-name">Guest</span>
                <span className="profile-role">Guest session</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>
              {/* Guest dropdown — no profile/settings pages, only auth actions */}
              <div className="profile-dropdown" style={{ minWidth: "210px" }}>
                <div style={{ padding: "10px 14px 10px", borderBottom: "1px solid rgba(31,41,55,0.8)", cursor: "default" }}>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", lineHeight: 1.6 }}>
                    You're browsing as a guest.<br />
                    Your session is not saved.
                  </p>
                </div>
                <a onClick={() => router.push("/register")} style={{ cursor: "pointer", color: "#93c5fd", fontWeight: 600 }}>
                  Create free account →
                </a>
                <a onClick={() => router.push("/login")} style={{ cursor: "pointer" }}>
                  Log in to existing account
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Guest notice bar */}
        <div style={{ padding: "9px 24px", background: "rgba(120,53,15,0.12)", borderBottom: "1px solid rgba(180,83,9,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ fontSize: "0.79rem", color: "#fbbf24" }}>
            👤 Guest session — all data is lost when you close this tab.
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => router.push("/register")} style={{ padding: "5px 14px", borderRadius: "999px", border: "1px solid rgba(37,99,235,0.4)", background: "rgba(37,99,235,0.12)", color: "#93c5fd", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" }}>
              Sign up free
            </button>
            <button onClick={() => router.push("/login")} style={{ padding: "5px 12px", borderRadius: "999px", border: "1px solid rgba(55,65,81,0.5)", background: "transparent", color: "#6b7280", fontSize: "0.74rem", cursor: "pointer" }}>
              Log in
            </button>
          </div>
        </div>

        {/* Report-ready banner */}
        {reportReady && (
          <div style={{ padding: "12px 24px", background: "linear-gradient(90deg, rgba(22,163,74,0.12), rgba(22,163,74,0.06))", borderBottom: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontSize: "0.85rem", color: "#bbf7d0", fontWeight: 600 }}>✅ Analysis complete — your report is ready.</span>
            <button onClick={() => scrollTo("section-download", downloadRef)}
              style={{ padding: "6px 16px", borderRadius: "999px", border: "1px solid rgba(34,197,94,0.4)", background: "rgba(22,163,74,0.15)", color: "#86efac", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
              View Report →
            </button>
          </div>
        )}
        {analysisStage === "running" && (
          <div style={{ padding: "12px 24px", background: "rgba(37,99,235,0.08)", borderBottom: "1px solid rgba(37,99,235,0.2)", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>⏳</span>
            <span style={{ fontSize: "0.85rem", color: "#93c5fd" }}>Analysis running — report will be ready shortly…</span>
          </div>
        )}

        {/* ── 1. Upload + Assistant ── */}
        <section className="upper-grid" id="section-upload" ref={uploadRef}>

          {/* Upload card */}
          <div className="card upload-card">
            <div className="card-header">
              <h2>Upload Dataset</h2>
              {file && (
                <button onClick={reset} style={{ padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(249,115,115,0.3)", background: "transparent", color: "#f97373", fontSize: "0.72rem", cursor: "pointer" }}>
                  ✕ Clear
                </button>
              )}
            </div>
            <p className="muted">Drag and drop your CSV, or click to browse. Max 50 MB.</p>

            <label onDragOver={e => e.preventDefault()} onDrop={handleDrop}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${file ? "rgba(34,197,94,0.5)" : "rgba(55,65,81,0.5)"}`, borderRadius: "14px", padding: "28px 20px", cursor: "pointer", textAlign: "center", background: file ? "rgba(22,163,74,0.04)" : "rgba(15,23,42,0.4)", gap: "8px", transition: "all 0.2s" }}>
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileInput} />
              {uploading ? (
                <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>Parsing…</p>
              ) : file ? (
                <>
                  <span style={{ fontSize: "26px" }}>✅</span>
                  <p style={{ margin: 0, fontWeight: 700, color: "#86efac", fontSize: "0.88rem" }}>{file.name}</p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.75rem" }}>{csvMeta?.rows} rows · {csvMeta?.columns} cols · {csvMeta?.sizeKB} KB</p>
                </>
              ) : (
                <>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.4">
                    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Drop your CSV here or click to browse</p>
                  <p style={{ margin: 0, color: "#374151", fontSize: "0.75rem" }}>Max 50 MB · .csv only</p>
                </>
              )}
            </label>

            {csvMeta && (
              <div className="stats-row">
                {[
                  { label: "Rows detected", value: csvMeta.rows.toLocaleString() },
                  { label: "Columns",       value: csvMeta.columns },
                  { label: "File size",     value: `${csvMeta.sizeKB} KB` },
                  { label: "Upload time",   value: "< 1s" },
                ].map(s => (
                  <div key={s.label} className="stat">
                    <span className="stat-label">{s.label}</span>
                    <span className="stat-value">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analysis assistant */}
          <div className="card analysis-chat-card">
            <div className="card-header">
              <h2>Analysis Assistant</h2>
              <span className="pill">
                {!csvMeta             && "Waiting for upload"}
                {csvMeta && analysisStage === "idle"    && "Ready"}
                {analysisStage === "running" && "Step 2 of 4 · Running"}
                {analysisStage === "done"    && "Step 4 of 4 · Complete"}
              </span>
            </div>
            <div className="analysis-timeline">
              <span className={`step ${csvMeta ? "done" : ""}`}>1. Upload</span>
              <span className={`step ${analysisStage === "running" ? "active" : analysisStage === "done" ? "done" : ""}`}>2. Profiling</span>
              <span className={`step ${analysisStage === "done" ? "done" : ""}`}>3. Insights</span>
              <span className={`step ${reportReady ? "done" : ""}`}>4. Report ready</span>
            </div>
            <div className="analysis-chat-log">
              {!csvMeta && (
                <div className="msg-row assistant">
                  <div className="msg">Upload a CSV to get started. I'll profile your data, flag quality issues, and generate a report.</div>
                </div>
              )}
              {csvMeta && analysisStage === "idle" && (
                <div className="msg-row assistant">
                  <div className="msg">
                    Dataset loaded: <strong>{file?.name}</strong><br />
                    <strong>{csvMeta.rows}</strong> rows · <strong>{csvMeta.columns}</strong> columns · {csvMeta.sizeKB} KB<br /><br />
                    Ready to analyse. Click Start Analysis to continue.
                  </div>
                </div>
              )}
              {analysisStage === "running" && (
                <div className="msg-row assistant pending">
                  <div className="msg">Profiling and cleaning your dataset…</div>
                </div>
              )}
              {analysisStage === "done" && (
                <>
                  <div className="msg-row assistant">
                    <div className="msg">Analysis complete. Your report and downloads are ready below.</div>
                  </div>
                  <div className="msg-row assistant">
                    <div className="msg" style={{ borderLeft: "2px solid rgba(251,191,36,0.4)", paddingLeft: "10px" }}>
                      ⚠ <strong style={{ color: "#fbbf24" }}>Guest session:</strong> Results are lost when you close this tab.{" "}
                      <button onClick={() => router.push("/register")} style={{ color: "#93c5fd", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", textDecoration: "underline", fontWeight: 600, padding: 0 }}>
                        Sign up to save →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="analysis-quick-actions">
              {csvMeta && analysisStage === "idle"    && <button className="chip-btn" onClick={runAnalysis}>Start Analysis</button>}
              {analysisStage === "running"            && <button className="chip-btn subtle" onClick={() => setAnalysisStage("idle")}>Cancel</button>}
              {analysisStage === "done"               && <button className="chip-btn" onClick={() => scrollTo("section-download", downloadRef)}>View Report →</button>}
            </div>
          </div>
        </section>

        {/* ── 2. Current dataset table ── */}
        <section className="dataset-management-grid" id="section-history" ref={historyRef}>
          <div className="card table-card">
            <div className="card-header">
              <h2>Current Dataset</h2>
              <span className="pill">{file ? "1 dataset" : "No upload yet"}</span>
            </div>
            <table className="dataset-table">
              <thead>
                <tr><th>Dataset name</th><th>Rows</th><th>Columns</th><th>Size</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {!file ? (
                  <tr>
                    <td><span style={{ color: "#4b5563", fontSize: "0.82rem" }}>No dataset uploaded yet</span></td>
                    <td style={{ color: "#374151" }}>—</td><td style={{ color: "#374151" }}>—</td><td style={{ color: "#374151" }}>—</td>
                    <td className="actions-cell">
                      <button className="table-action" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>Download</button>
                      <button className="table-action delete" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>Delete</button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ display: "inline-flex", padding: "4px", background: "rgba(37,99,235,0.12)", borderRadius: "6px", flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </span>
                        <span style={{ fontWeight: 500, color: "#e5e7eb" }}>{file.name}</span>
                      </div>
                    </td>
                    <td>{csvMeta?.rows}</td><td>{csvMeta?.columns}</td><td>{csvMeta?.sizeKB} KB</td>
                    <td className="actions-cell">
                      <button className="table-action" onClick={downloadOriginal} style={{ borderColor: "rgba(37,99,235,0.35)", color: "#93c5fd" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                      </button>
                      <button className="table-action delete" onClick={reset}>Delete</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 3. Charts ── */}
        <section id="section-charts" ref={chartsRef}>
          <div className="card">
            <div className="card-header">
              <h2>AI Insights & Charts</h2>
              <span className="pill">{reportReady ? "Ready" : "Pending analysis"}</span>
            </div>
            {!reportReady ? (
              <p className="muted-small" style={{ padding: "32px 0", textAlign: "center" }}>Run analysis to generate visualizations.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                {["Distribution", "Correlation", "Trend", "Outliers", "Summary"].map((label, i) => (
                  <div key={i} style={{ height: "140px", borderRadius: "12px", background: "rgba(15,23,42,0.8)", border: "1px solid rgba(31,41,55,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.4"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>{label} chart</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── 4. Report & Exports ── */}
        <section id="section-download" ref={downloadRef}>
          <div className="card analysis-report-card">
            <div className="card-header">
              <h2>Report & Exports</h2>
              <span className="pill" style={reportReady ? { borderColor: "rgba(34,197,94,0.5)", color: "#bbf7d0", background: "rgba(22,163,74,0.1)" } : {}}>
                {reportReady ? "✓ Ready" : "Not started"}
              </span>
            </div>
            <p className="muted-small">
              {reportReady ? "Downloads are available this session only — sign up to save permanently." : "Run analysis to generate your report."}
            </p>
            <button className="primary-btn-lg" disabled={!reportReady} onClick={reportReady ? downloadReport : undefined}
              style={{ opacity: reportReady ? 1 : 0.4, cursor: reportReady ? "pointer" : "not-allowed" }}>
              ↓ Download Report
            </button>
            <div className="export-buttons">
              <button className="secondary-btn" disabled={!file} onClick={file ? downloadOriginal : undefined}
                style={{ opacity: file ? 1 : 0.4, cursor: file ? "pointer" : "not-allowed" }}>
                Download original CSV
              </button>
              <button className="secondary-btn" disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>
                Download cleaned CSV
              </button>
            </div>

            {/* Sign-up upsell */}
            <div style={{ padding: "16px 18px", borderRadius: "14px", background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#bfdbfe", fontSize: "0.85rem" }}>💡 Want to keep your results?</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.78rem" }}>Sign up free to save your dataset, get a full PDF report, and access your work anytime.</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button onClick={() => router.push("/register")} style={{ padding: "8px 18px", borderRadius: "999px", border: "none", background: "linear-gradient(90deg, #2563eb, #4f46e5)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                  Create free account
                </button>
                <button onClick={() => router.push("/login")} style={{ padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(55,65,81,0.8)", background: "transparent", color: "#9ca3af", fontSize: "0.82rem", cursor: "pointer" }}>
                  Log in
                </button>
              </div>
            </div>

            <div className="report-preview">
              <h3 style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "10px", letterSpacing: "0.05em", textTransform: "uppercase" }}>What's included</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {[
                  { emoji: "📊", title: "Data Overview",        desc: "Row/column counts, types, and summary." },
                  { emoji: "🔍", title: "Data Quality",         desc: "Missing values, duplicates, anomalies." },
                  { emoji: "📈", title: "Statistical Insights", desc: "Distributions, outliers, correlations." },
                  { emoji: "🤖", title: "AI Commentary",        desc: "Plain-language interpretation of patterns." },
                  { emoji: "🧹", title: "Cleaning Log",         desc: "Every transformation applied to your data." },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "9px 12px", borderRadius: "10px", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(31,41,55,0.8)" }}>
                    <span style={{ fontSize: "14px", flexShrink: 0 }}>{s.emoji}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#d1d5db" }}>{s.title}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#4b5563" }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. Help — same as real dashboard ── */}
        <section id="section-help" ref={helpRef}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="card info-card">
              <h2>Help Center</h2>
              <table><thead><tr><th>Topic</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td>Uploading CSV files</td><td>Updated</td></tr>
                  <tr><td>Supported formats</td><td>Updated</td></tr>
                  <tr><td>AI-generated summaries</td><td>Beta</td></tr>
                  <tr><td>Download options</td><td>Updated</td></tr>
                </tbody>
              </table>
              <span className="muted-link" style={{ cursor: "default" }}>View documentation →</span>
            </div>
            <div className="card info-card">
              <h2>Contact Support</h2>
              <table><thead><tr><th>Channel</th><th>Response</th></tr></thead>
                <tbody>
                  <tr><td>Email</td><td>1–2 business days</td></tr>
                  <tr><td>Live chat</td><td>Coming soon</td></tr>
                  <tr><td>GitHub</td><td>Within 48 hours</td></tr>
                </tbody>
              </table>
              <a href="mailto:support.dig@proton.me" className="muted-link">support.dig@proton.me →</a>
            </div>
          </div>
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
function IconSignIn()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>; }