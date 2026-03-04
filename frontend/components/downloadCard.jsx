// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";

const REPORT_SECTIONS = [
  { emoji: "📊", title: "Data Overview", desc: "Row/column counts, data types, and a plain-language summary of your dataset." },
  { emoji: "🔍", title: "Data Quality Analysis", desc: "Missing values, duplicates, and anomalies found — and how each was handled." },
  { emoji: "📈", title: "Statistical Insights", desc: "Distributions, outliers, skewness, and correlations with charts and explanations." },
  { emoji: "🤖", title: "AI Commentary", desc: "Natural language interpretation of patterns and trends written by the assistant." },
  { emoji: "🧹", title: "Cleaning Log", desc: "Every transformation applied — dropped rows, filled nulls, renamed columns." },
  { emoji: "📉", title: "Visualizations", desc: "All charts embedded with captions: bar charts, heatmaps, scatter plots, trend lines." },
];

/* ── PDF Preview Modal ── */
function PDFModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#020617", border: "1px solid rgba(31,41,55,0.9)", borderRadius: "18px", padding: "26px", maxWidth: "640px", width: "100%", display: "flex", flexDirection: "column", gap: "18px", boxShadow: "0 24px 60px rgba(0,0,0,0.6)", maxHeight: "85vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.6">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#e5e7eb" }}>analysis_report.pdf</h3>
              <p className="muted-small" style={{ marginTop: "2px" }}>Report preview</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(55,65,81,0.8)", borderRadius: "8px", padding: "7px", color: "#6b7280", cursor: "pointer", display: "flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mock PDF page preview */}
        <div style={{ background: "#fff", borderRadius: "10px", padding: "28px", color: "#1a1a1a", fontSize: "0.82rem", lineHeight: "1.7" }}>
          <div style={{ borderBottom: "2px solid #1d4ed8", paddingBottom: "12px", marginBottom: "16px" }}>
            <p style={{ margin: 0, fontSize: "0.65rem", color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>DIG — Data Insight Generator</p>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>Analysis Report</h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "#6b7280" }}>Generated automatically · Confidential</p>
          </div>
          {REPORT_SECTIONS.map((s, i) => (
            <div key={i} style={{ marginBottom: "14px" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#0f172a", fontSize: "0.82rem" }}>{s.emoji} {s.title}</p>
              <p style={{ margin: 0, color: "#374151", fontSize: "0.77rem" }}>{s.desc}</p>
            </div>
          ))}
          <div style={{ marginTop: "20px", paddingTop: "12px", borderTop: "1px solid #e5e7eb", fontSize: "0.7rem", color: "#9ca3af", textAlign: "center" }}>
            Page 1 of 6 · analysis_report.pdf
          </div>
        </div>

        <p className="muted-small" style={{ textAlign: "center" }}>
          This is a preview. Download for the full report.
        </p>
      </div>
    </div>
  );
}

export default function DownloadCard() {
  const [reportReady, setReportReady] = useState(false);
  const [showPDF, setShowPDF] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    fetch("/api/datasets/history")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setReportReady(d.length > 0))
      .catch(() => {});
  }, []);

  const handleEmail = () => {
    // In production: POST to backend which uses admin.dig@proton.me to send report to user's email
    // The admin email (admin.dig@proton.me) sends from server; user receives at their registered email
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 4000);
  };

  const disabled = !reportReady;

  return (
    <>
      {showPDF && <PDFModal onClose={() => setShowPDF(false)} />}

      <div className="card analysis-report-card">
        <div className="card-header">
          <h2>Report & Exports</h2>
          <span
            className="pill"
            style={reportReady
              ? { borderColor: "rgba(34,197,94,0.5)", color: "#bbf7d0", background: "rgba(22,163,74,0.1)" }
              : {}}
          >
            {reportReady ? "✓ Report ready" : "Not started"}
          </span>
        </div>

        <p className="muted-small">
          {reportReady
            ? "Your analysis is complete. View, download, or email your report below."
            : "Complete an analysis first to unlock your report."}
        </p>

        {/* PDF file row */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(31,41,55,0.9)" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: reportReady ? "rgba(239,68,68,0.15)" : "rgba(31,41,55,0.8)", border: `1px solid ${reportReady ? "rgba(239,68,68,0.3)" : "rgba(55,65,81,0.8)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={reportReady ? "#f87171" : "#4b5563"} strokeWidth="1.6">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: reportReady ? "#e5e7eb" : "#4b5563" }}>
              analysis_report.pdf
            </p>
            <p className="muted-small">{reportReady ? "Ready" : "Pending analysis"}</p>
          </div>

          {/* View PDF button */}
          <button
            disabled={disabled}
            onClick={() => !disabled && setShowPDF(true)}
            style={{
              background: "rgba(37,99,235,0.12)",
              border: "1px solid rgba(37,99,235,0.3)",
              borderRadius: "8px",
              padding: "6px 12px",
              color: disabled ? "#374151" : "#93c5fd",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.45 : 1,
            }}
          >
            View PDF
          </button>
        </div>

        {/* Primary: Download */}
        <button
          className="primary-btn-lg"
          disabled={disabled}
          style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
          onClick={() => !disabled && alert("Downloading PDF report…")}
        >
          ↓  Download PDF Report
        </button>

        {/* Secondary: cleaned CSV + email */}
        <div className="export-buttons">
          <button
            className="secondary-btn"
            disabled={disabled}
            style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
            onClick={() => !disabled && alert("Downloading cleaned CSV…")}
          >
            Download cleaned CSV
          </button>

          {/* Email — sends via admin.dig@proton.me to the user's registered email */}
          <button
            className="secondary-btn"
            disabled={disabled}
            style={{
              opacity: disabled ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
              color: emailSent ? "#bbf7d0" : undefined,
              borderColor: emailSent ? "rgba(34,197,94,0.4)" : undefined,
            }}
            onClick={() => !disabled && handleEmail()}
          >
            {emailSent ? "✓ Email sent to your inbox!" : "Email me the report"}
          </button>
        </div>

        <p className="muted-small" style={{ fontStyle: "italic" }}>
          Email delivery is sent from admin.dig@proton.me to your registered address.
        </p>

        {/* What's included */}
        <div className="report-preview">
          <h3 style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "10px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            What's included in your report
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {REPORT_SECTIONS.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "9px 12px", borderRadius: "10px", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(31,41,55,0.8)" }}>
                <span style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }}>{s.emoji}</span>
                <div>
                  <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#d1d5db" }}>{s.title}</p>
                  <p className="muted-small" style={{ marginTop: "2px", lineHeight: "1.5" }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}