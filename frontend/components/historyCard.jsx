// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

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
      alert("Download failed: " + err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this dataset? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await BackendAPI.deleteCurrentDataset(token);
      onDelete?.();
    } catch (err) {
      alert("Delete failed: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card table-card">
      <div className="card-header">
        <h2>Current Dataset</h2>
        <span className="pill">{dataset ? "1 dataset" : "No upload yet"}</span>
      </div>

      <table className="dataset-table">
        <thead>
          <tr>
            <th>Dataset name</th>
            <th>Rows</th>
            <th>Columns</th>
            <th>Size</th>
            <th>Actions</th>
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
                  <span style={{ color:"#4b5563", fontSize:"0.82rem" }}>No completed analysis yet</span>
                </div>
              </td>
              {["—","—","—"].map((v,i) => <td key={i} style={{ color:"#374151" }}>{v}</td>)}
              <td className="actions-cell">
                <button className="table-action" disabled style={{ opacity:0.3, cursor:"not-allowed" }}>Download</button>
                <button className="table-action delete" disabled style={{ opacity:0.3, cursor:"not-allowed" }}>Delete</button>
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
                  Download
                </button>
                <button className="table-action delete" onClick={handleDelete} disabled={deleting}
                  style={{ opacity: deleting ? 0.5 : 1 }}>
                  {deleting ? "…" : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign:"middle", marginRight:"4px" }}>
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      Delete
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
            ↓ Download cleaned CSV
          </button>
          {dataset.hasPdfReport && (
            <button className="secondary-btn" style={{ fontSize:"0.78rem", padding:"6px 14px" }}
              onClick={() => handleDownload("report", dataset.reportFileName)}>
              ↓ Download PDF report — {dataset.reportFileName}
            </button>
          )}
        </div>
      )}
    </div>
  );
}