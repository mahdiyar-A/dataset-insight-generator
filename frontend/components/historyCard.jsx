// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";

const T = {
  en: {
    title: "Current Dataset",
    oneDataset: "1 dataset",
    noUpload: "No upload yet",
    headers: { name: "Dataset name", rows: "Rows", cols: "Columns", size: "Size", actions: "Actions" },
    noAnalysis: "No completed analysis yet",
    download: "Download",
    delete: "Delete",
    deleting: "…",
    cleanedCsv: "↓ Download cleaned CSV",
    pdfReport: (name) => `↓ Download PDF report — ${name}`,
    confirmDelete: "Delete this dataset? This cannot be undone.",
    downloadFailed: (msg) => "Download failed: " + msg,
    deleteFailed: (msg) => "Delete failed: " + msg,
  },
  fr: {
    title: "Jeu de données actuel",
    oneDataset: "1 jeu de données",
    noUpload: "Aucun fichier importé",
    headers: { name: "Nom du jeu de données", rows: "Lignes", cols: "Colonnes", size: "Taille", actions: "Actions" },
    noAnalysis: "Aucune analyse complétée",
    download: "Télécharger",
    delete: "Supprimer",
    deleting: "…",
    cleanedCsv: "↓ Télécharger le CSV nettoyé",
    pdfReport: (name) => `↓ Télécharger le rapport PDF — ${name}`,
    confirmDelete: "Supprimer ce jeu de données ? Cette action est irréversible.",
    downloadFailed: (msg) => "Échec du téléchargement : " + msg,
    deleteFailed: (msg) => "Échec de la suppression : " + msg,
  },
  fa: {
    title: "مجموعه داده جاری",
    oneDataset: "۱ مجموعه داده",
    noUpload: "هنوز فایلی بارگذاری نشده",
    headers: { name: "نام مجموعه داده", rows: "ردیف‌ها", cols: "ستون‌ها", size: "حجم", actions: "عملیات" },
    noAnalysis: "هنوز تحلیلی کامل نشده",
    download: "دانلود",
    delete: "حذف",
    deleting: "…",
    cleanedCsv: "↓ دانلود CSV پاک‌شده",
    pdfReport: (name) => `↓ دانلود گزارش PDF — ${name}`,
    confirmDelete: "این مجموعه داده حذف شود؟ این عملیات قابل بازگشت نیست.",
    downloadFailed: (msg) => "خطا در دانلود: " + msg,
    deleteFailed: (msg) => "خطا در حذف: " + msg,
  },
};

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

// dataset prop comes from dashboard (no double fetch)
// onDelete callback tells dashboard to clear its state
export default function HistoryCard({ dataset, onDelete }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;
  const [deleting, setDeleting] = useState(false);

  // Only show datasets that have been through analysis (isPending=false and status=done)
  const showDataset = dataset && !dataset.isPending && dataset.status === "done";

  const handleDownload = async (type, fallbackName) => {
    try {
      const { url, fileName } = await BackendAPI.getDownloadUrl(token, type);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || fallbackName;
      a.target = "_blank";
      a.click();
    } catch (err) {
      alert(t.downloadFailed(err.message));
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.confirmDelete)) return;
    setDeleting(true);
    try {
      await BackendAPI.deleteCurrentDataset(token);
      onDelete?.();
    } catch (err) {
      alert(t.deleteFailed(err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card table-card">
      <div className="card-header">
        <h2>{t.title}</h2>
        <span className="pill">{dataset ? t.oneDataset : t.noUpload}</span>
      </div>

      <table className="dataset-table">
        <thead>
          <tr>
            <th>{t.headers.name}</th>
            <th>{t.headers.rows}</th>
            <th>{t.headers.cols}</th>
            <th>{t.headers.size}</th>
            <th>{t.headers.actions}</th>
          </tr>
        </thead>
        <tbody>
          {!showDataset ? (
            <tr>
              <td>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ display:"inline-flex", padding:"4px", background:"rgba(31,41,55,0.6)", borderRadius:"6px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </span>
                  <span style={{ color:"#4b5563", fontSize:"0.82rem" }}>{t.noAnalysis}</span>
                </div>
              </td>
              {["—","—","—"].map((v,i) => <td key={i} style={{ color:"#374151" }}>{v}</td>)}
              <td className="actions-cell">
                <button className="table-action" disabled style={{ opacity:0.3, cursor:"not-allowed" }}>{t.download}</button>
                <button className="table-action delete" disabled style={{ opacity:0.3, cursor:"not-allowed" }}>{t.delete}</button>
              </td>
            </tr>
          ) : (
            <tr>
              <td>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ display:"inline-flex", padding:"4px", background:"rgba(37,99,235,0.12)", borderRadius:"6px", flexShrink:0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </span>
                  <span style={{ fontWeight:500, color:"#e5e7eb" }}>{dataset.fileName ?? "—"}</span>
                </div>
              </td>
              <td>{dataset.rowCount    ?? "—"}</td>
              <td>{dataset.columnCount ?? "—"}</td>
              <td>{formatSize(dataset.fileSizeBytes)}</td>
              <td className="actions-cell">
                <button className="table-action" onClick={() => handleDownload("original", dataset.fileName)}
                  style={{ borderColor:"rgba(37,99,235,0.35)", color:"#93c5fd" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign:"middle", marginRight:"4px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {t.download}
                </button>
                <button className="table-action delete" onClick={handleDelete} disabled={deleting}
                  style={{ opacity: deleting ? 0.5 : 1 }}>
                  {deleting ? t.deleting : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign:"middle", marginRight:"4px" }}>
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      {t.delete}
                    </>
                  )}
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Cleaned CSV + PDF report — shown when analysis is done */}
      {dataset?.hasCleanedCsv && (
        <div style={{ marginTop:"10px", display:"flex", gap:"8px", flexWrap:"wrap" }}>
          <button className="secondary-btn" style={{ fontSize:"0.78rem", padding:"6px 14px" }}
            onClick={() => handleDownload("cleaned", `cleaned_${dataset.fileName}`)}>
            {t.cleanedCsv}
          </button>
          {dataset.hasPdfReport && (
            <button className="secondary-btn" style={{ fontSize:"0.78rem", padding:"6px 14px" }}
              onClick={() => handleDownload("report", dataset.reportFileName)}>
              {t.pdfReport(dataset.reportFileName)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
