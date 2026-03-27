// @ts-nocheck
"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

export default function UploadCard({ onUploadSuccess, resetKey, guestMode = false, guestSessionId = null }) {
  const { token } = useAuth();
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const fileInputRef = useRef(null);

  const [file,     setFile]     = useState(null);
  const [status,   setStatus]   = useState("idle");
  const [stats,    setStats]    = useState({ rows: null, columns: null, size: null });
  const [preview,  setPreview]  = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset when analysis completes (resetKey incremented by dashboard)
  useEffect(() => {
    if (resetKey === 0) return; // skip initial mount
    setFile(null);
    setStatus("idle");
    setStats({ rows: null, columns: null, size: null });
    setPreview(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [resetKey]);

  const parseCSV = (text) => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return null;
    const allHeaders = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const headers    = allHeaders.slice(0, 10);
    const dataRows   = lines.slice(1);
    const totalRows  = dataRows.length;

    let missingCount = 0;
    const previewRows = dataRows.slice(0, 10).map((line) => {
      const cells = line.split(",").map((c) => c.trim().replace(/"/g, ""));
      cells.forEach((c) => {
        if (!c || c.toLowerCase() === "na" || c.toLowerCase() === "null") missingCount++;
      });
      return cells.slice(0, 10);
    });

    return {
      headers,
      rows: previewRows,
      totalRows,
      totalCols: allHeaders.length,
      missing: missingCount,
    };
  };

  const handleFile = async (selectedFile) => {
    if (!selectedFile || !selectedFile.name.endsWith(".csv")) {
      alert("Please upload a .csv file.");
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      alert("File exceeds 50 MB limit.");
      return;
    }

    setFile(selectedFile);
    setStatus("uploading");
    setErrorMsg("");

    const uploadTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const sizeKB     = (selectedFile.size / 1024).toFixed(1);
    const text       = await selectedFile.text();
    const parsed     = parseCSV(text);

    // Show preview immediately from client-side parse — no waiting for backend
    if (parsed) {
      setStats({
        rows:    parsed.totalRows.toLocaleString(),
        columns: parsed.totalCols,
        size:    `${sizeKB} KB`,
      });
      setPreview({ headers: parsed.headers, rows: parsed.rows, totalCols: parsed.totalCols });
    }

    // Send to backend to save as temp file (needed for analysis later)
    try {
      let result;
      if (guestMode) {
        const form = new FormData();
        form.append("file",      selectedFile);
        form.append("sessionId", guestSessionId ?? "guest");
        form.append("rows",      String(parsed?.totalRows ?? 0));
        form.append("columns",   String(parsed?.totalCols ?? 0));
        const res = await fetch(`${API_BASE}/api/guest/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error("Upload failed");
        result = await res.json();
      } else {
        result = await BackendAPI.uploadDataset(
          token, selectedFile,
          parsed?.totalRows ?? 0,
          parsed?.totalCols ?? 0
        );
      }
      setStatus("done");
      onUploadSuccess?.(result);
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
      setErrorMsg(err?.message || "Upload failed. Try again.");
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [token]);

  const progressWidth = { idle: "0%", uploading: "55%", done: "100%", error: "100%" };
  const statusLabel   = { idle: "Idle", uploading: "Uploading", done: "Ready", error: "Failed" };
  const pillClass     = status === "done" ? "ready" : status;

  return (
    <div className="card upload-card">
      <div className="card-header">
        <h2>Upload Dataset</h2>
        <span className={`status-pill ${pillClass}`}>{statusLabel[status]}</span>
      </div>

      <p className="muted">Drag and drop your .csv file here, or click to browse. Max 50 MB.</p>

      {/* Dropzone */}
      <label
        className="upload-dropzone"
        style={{
          padding: "28px 24px",
          borderColor: dragging ? "var(--accent)" : undefined,
          background: dragging
            ? `radial-gradient(circle at top left, rgba(var(--accent-rgb),0.22), var(--panel))`
            : undefined,
          transition: "border-color 0.2s, background 0.2s",
        }}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div className="dropzone-inner">
          <div className="dropzone-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </div>
          <div>
            <p className="dropzone-title" style={{ fontSize: "1rem", color:"var(--text)" }}>
              {file ? file.name : "Drop your file here"}
            </p>
            <p className="muted-small">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to choose a .csv file"}
            </p>
          </div>
        </div>
      </label>

      {/* Progress bar */}
      <div className="upload-status-bar">
        <div className="status-header">
          <span style={{ color: status === "error" ? "#f97373" : undefined }}>
            {status === "idle"      && "No file selected."}
            {status === "uploading" && "Uploading…"}
            {status === "done"      && "Upload complete."}
            {status === "error"     && (errorMsg || "Upload failed. Try again.")}
          </span>
          <span className={`status-pill ${pillClass}`}>{statusLabel[status]}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: progressWidth[status],
              background: status === "error"
                ? "linear-gradient(90deg,#f97373,#ef4444)"
                : undefined,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        {[
        { label: "Rows",    value: stats.rows    ?? "–" },
        { label: "Columns", value: stats.columns ?? "–" },
        { label: "Size",    value: stats.size    ?? "–" },
      ].map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Dataset Preview — shown after file parsed */}
      {preview && (
        <div style={{ marginTop: "4px" }}>
          <div className="card-header" style={{ marginBottom: "8px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-soft)" }}>
              Dataset Preview
            </span>
            <span className="pill">
              First 10 rows · {preview.headers.length} of {preview.totalCols} cols shown
            </span>
          </div>
          <div style={{
            overflowX: "auto",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px", color: "var(--text-soft)", fontWeight: 500, textAlign: "center", width: "28px", background: "var(--panel2)" }}>
                    #
                  </th>
                  {preview.headers.map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", color: "var(--accent)", fontWeight: 500, textAlign: "left", whiteSpace: "nowrap", background: "var(--panel2)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(var(--accent-rgb), 0.04)" : "transparent", borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--text-soft)", textAlign: "center", fontSize: "0.7rem" }}>
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => {
                      const isEmpty = !cell || cell === "" || cell.toLowerCase() === "na" || cell.toLowerCase() === "null";
                      return (
                        <td key={ci} style={{ padding: "6px 12px", whiteSpace: "nowrap", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", color: isEmpty ? "var(--danger)" : "var(--text)" }}>
                          {isEmpty ? <span style={{ opacity: 0.5 }}>—</span> : cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted-small" style={{ marginTop: "6px" }}>
            ⚠ Missing / null values shown in red — these will be addressed during analysis.
          </p>
        </div>
      )}
    </div>
  );
}