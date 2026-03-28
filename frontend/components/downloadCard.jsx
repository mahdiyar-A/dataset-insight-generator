// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useTranslations } from "next-intl";
import BackendAPI from "@/lib/BackendAPI";

const REPORT_SECTIONS = [
  { emoji: "📊", title: "Data Overview",         desc: "Row/column counts, data types, and a plain-language summary of your dataset." },
  { emoji: "🔍", title: "Data Quality Analysis", desc: "Missing values, duplicates, and anomalies found — and how each was handled." },
  { emoji: "📈", title: "Statistical Insights",  desc: "Distributions, outliers, skewness, and correlations with charts and explanations." },
  { emoji: "🤖", title: "AI Commentary",         desc: "Natural language interpretation of patterns and trends written by the assistant." },
  { emoji: "🧹", title: "Cleaning Log",          desc: "Every transformation applied — dropped rows, filled nulls, renamed columns." },
  { emoji: "📉", title: "Visualizations",        desc: "All charts embedded with captions: bar charts, heatmaps, scatter plots, trend lines." },
];

function PDFModal({ reportFileName, pdfUrl, onClose, livePreviewLabel, loadFailLabel }) {
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
              <p className="muted-small" style={{ marginTop:"2px" }}>{livePreviewLabel}</p>
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
        <p className="muted-small" style={{ textAlign:"center", margin:0 }}>{loadFailLabel}</p>
      </div>
    </div>
  );
}

// dataset prop from dashboard — no independent fetch
export default function DownloadCard({ dataset }) {
  const { token } = useAuth();
  const t = useTranslations("download");
  const [showPDF,      setShowPDF]      = useState(false);
  const [pdfUrl,       setPdfUrl]       = useState("");
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const reportReady  = dataset?.hasPdfReport  === true;
  const cleanedReady = dataset?.hasCleanedCsv === true;
  const reportFileName = dataset?.reportFileName ?? "analysis_report.pdf";

  const handleDownload = async (type, fallbackName) => {
    try {
      const { url, fileName } = await BackendAPI.getDownloadUrl(token, type);
      const a = document.createElement("a");
      a.href = url; a.download = fileName || fallbackName; a.target = "_blank"; a.click();
    } catch (err) {
      alert(t("downloadFailed") + err.message);
    }
  };

  const handleViewPdf = async () => {
    try {
      setPdfLoading(true);
      const { url } = await BackendAPI.getDownloadUrl(token, "report");
      setPdfUrl(url);
      setShowPDF(true);
    } catch (err) {
      alert(t("pdfOpenFailed") + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleEmail = async () => {
    try {
      setEmailSending(true);
      await BackendAPI.emailReport(token, { subject: "Your DIG report is ready", includeAttachment: true });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err) {
      alert(t("emailFailed") + err.message);
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <>
      {showPDF && <PDFModal reportFileName={reportFileName} pdfUrl={pdfUrl} onClose={() => { setShowPDF(false); setPdfUrl(""); }} livePreviewLabel={t("pdfModalPreviewTitle")} loadFailLabel={t("pdfPreviewLoadFail")} />}

      <div className="card analysis-report-card">
        <div className="card-header">
          <h2>{t("title")}</h2>
          <span className="pill" style={reportReady ? { borderColor:"rgba(34,197,94,0.5)", color:"#bbf7d0", background:"rgba(22,163,74,0.1)" } : {}}>
            {reportReady ? t("pillReady") : dataset ? t("pillNotStarted") : t("pillNoDataset")}
          </span>
        </div>

        <p className="muted-small">
          {reportReady  ? t("descReady")
          : dataset     ? t("descNotStarted")
          :               t("descNoDataset")}
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
            <p className="muted-small">{reportReady ? t("pdfStatusReady") : t("pdfStatusPending")}</p>
          </div>
          <button disabled={!reportReady || pdfLoading} onClick={() => reportReady && handleViewPdf()}
            style={{ background:"rgba(37,99,235,0.12)", border:"1px solid rgba(37,99,235,0.3)", borderRadius:"8px", padding:"6px 12px", color:(!reportReady||pdfLoading) ? "#374151" : "#93c5fd", fontSize:"0.75rem", fontWeight:600, cursor:(!reportReady||pdfLoading) ? "not-allowed" : "pointer", opacity:(!reportReady||pdfLoading) ? 0.45 : 1 }}>
            {pdfLoading ? t("viewPdfLoading") : t("viewPdf")}
          </button>
        </div>

        {/* Download PDF */}
        <button className="primary-btn-lg" disabled={!reportReady}
          style={{ opacity:!reportReady ? 0.45 : 1, cursor:!reportReady ? "not-allowed" : "pointer" }}
          onClick={() => reportReady && handleDownload("report", reportFileName)}>
          {t("downloadPdf", { fileName: reportFileName })}
        </button>

        {/* Secondary exports */}
        <div className="export-buttons">
          {cleanedReady ? (
            <button className="secondary-btn"
              onClick={() => handleDownload("cleaned", `cleaned_${dataset?.fileName}`)}>
              {t("downloadCleaned")}
            </button>
          ) : (
            <div style={{ padding:"10px 14px", borderRadius:"10px", background:"rgba(15,23,42,0.6)", border:"1px solid rgba(31,41,55,0.8)", fontSize:"0.78rem", color:"#4b5563", fontStyle:"italic" }}>
              {t("cleanedNotApplicable")}
            </div>
          )}
          <button className="secondary-btn" disabled={!reportReady || emailSending}
            style={{ opacity:(!reportReady||emailSending) ? 0.45 : 1, cursor:(!reportReady||emailSending) ? "not-allowed" : "pointer", color: emailSent ? "#bbf7d0" : undefined, borderColor: emailSent ? "rgba(34,197,94,0.4)" : undefined }}
            onClick={() => reportReady && handleEmail()}>
            {emailSending ? t("emailSending") : emailSent ? t("emailSent") : t("emailReport")}
          </button>
        </div>

        <p className="muted-small" style={{ fontStyle:"italic" }}>
          {t("emailFooter")}
        </p>

        {/* What's included */}
        <div className="report-preview">
          <h3 style={{ fontSize:"0.78rem", color:"#6b7280", marginBottom:"10px", letterSpacing:"0.05em", textTransform:"uppercase" }}>
            {t("whatsIncluded")}
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
            {REPORT_SECTIONS.map((s,i) => (
              <div key={i} style={{ display:"flex", gap:"10px", alignItems:"flex-start", padding:"9px 12px", borderRadius:"10px", background:"rgba(15,23,42,0.9)", border:"1px solid rgba(31,41,55,0.8)" }}>
                <span style={{ fontSize:"15px", flexShrink:0, marginTop:"1px" }}>{s.emoji}</span>
                <div>
                  <p style={{ margin:0, fontSize:"0.8rem", fontWeight:600, color:"#d1d5db" }}>{t(`section${i}Title`)}</p>
                  <p className="muted-small" style={{ marginTop:"2px", lineHeight:"1.5" }}>{t(`section${i}Desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}