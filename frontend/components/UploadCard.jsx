// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { useSettings } from "@/app/contexts/SettingsContext";
import {
  MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, canPreviewInBrowser, extensionOf, isAcceptedFile, previewFromUpload,
} from "@/lib/uploadFormats";

const T = {
  en: {
    title: "Upload Dataset",
    hint: "CSV, Excel, JSON, XML, Parquet, SPSS, Stata, SAS, SQLite and more, zipped or not. Max 50 MB.",
    drop: "Drop your file here",
    browse: "or click to choose a data file",
    badType: (ext) => `${ext ? ext + " files" : "That file"} can't be analysed. Use CSV, Excel, JSON, XML, Parquet, SPSS, Stata, SAS or SQLite.`,
    tooLarge: "That file is over the 50 MB limit.",
    status: { idle: "Idle", uploading: "Uploading", done: "Ready", error: "Failed" },
    statusMsg: {
      idle: "No file selected.",
      uploading: "Uploading and reading your file…",
      done: "Upload complete.",
    },
    stats: { rows: "Rows", columns: "Columns", size: "Size" },
    preview: "Dataset Preview",
    previewSub: (rows, cols, total) => `First ${rows} rows · ${cols} of ${total} cols shown`,
    missing: "⚠ Missing / null values shown in red — these will be addressed during analysis.",
  },
  fr: {
    title: "Importer un dataset",
    hint: "CSV, Excel, JSON, XML, Parquet, SPSS, Stata, SAS, SQLite et plus, compressés ou non. Max 50 Mo.",
    drop: "Déposez votre fichier ici",
    browse: "ou cliquez pour choisir un fichier de données",
    badType: (ext) => `${ext ? "Les fichiers " + ext : "Ce fichier"} ne peuvent pas être analysés. Utilisez CSV, Excel, JSON, XML, Parquet, SPSS, Stata, SAS ou SQLite.`,
    tooLarge: "Ce fichier dépasse la limite de 50 Mo.",
    status: { idle: "Inactif", uploading: "Import…", done: "Prêt", error: "Échec" },
    statusMsg: {
      idle: "Aucun fichier sélectionné.",
      uploading: "Import et lecture du fichier…",
      done: "Import terminé.",
    },
    stats: { rows: "Lignes", columns: "Colonnes", size: "Taille" },
    preview: "Aperçu du dataset",
    previewSub: (rows, cols, total) => `${rows} premières lignes · ${cols} sur ${total} colonnes`,
    missing: "⚠ Valeurs manquantes / nulles en rouge — elles seront traitées lors de l'analyse.",
  },
  fa: {
    title: "آپلود دیتاست",
    hint: "CSV، اکسل، JSON، XML، Parquet، SPSS، Stata، SAS، SQLite و بیشتر، فشرده یا معمولی. حداکثر ۵۰ مگابایت.",
    drop: "فایل خود را اینجا رها کنید",
    browse: "یا برای انتخاب فایل داده کلیک کنید",
    badType: (ext) => `${ext ? "فایل‌های " + ext : "این فایل"} قابل تحلیل نیستند. از CSV، اکسل، JSON، XML، Parquet، SPSS، Stata، SAS یا SQLite استفاده کنید.`,
    tooLarge: "این فایل از سقف ۵۰ مگابایت بزرگ‌تر است.",
    status: { idle: "آماده", uploading: "در حال آپلود", done: "آماده", error: "خطا" },
    statusMsg: {
      idle: "فایلی انتخاب نشده.",
      uploading: "در حال آپلود و خواندن فایل…",
      done: "آپلود کامل شد.",
    },
    stats: { rows: "ردیف‌ها", columns: "ستون‌ها", size: "حجم" },
    preview: "پیش‌نمایش دیتاست",
    previewSub: (rows, cols, total) => `${rows} ردیف اول · ${cols} از ${total} ستون`,
    missing: "⚠ مقادیر گم‌شده / تهی با رنگ قرمز نشان داده شده‌اند — در طول تحلیل رفع می‌شوند.",
  },
};

/**
 * @param {{
 *   onUploadSuccess: (meta: import("@/lib/types").UploadedFileMeta) => void,
 *   onUploadStart?: () => void,
 *   onUploadFailed?: () => void,
 *   resetKey: number,
 *   guestMode?: boolean,
 *   guestSessionId?: string | null,
 * }} props
 *
 * onUploadStart is optional — it is called with `?.()` and the authenticated
 * dashboard does not supply it. Typing it as required made the dashboard fail
 * the production type check.
 *
 * onUploadFailed fires when the server refuses a file. By then it has dropped
 * any upload that was waiting, so the dashboard must stop offering Start for it.
 */
export default function UploadCard({ onUploadSuccess, onUploadStart, onUploadFailed, resetKey, guestMode = false, guestSessionId = null }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;
  const fileInputRef = useRef(null);
  const uploadingRef = useRef(false); // a ref, so a second drop sees it straight away

  const [file,     setFile]     = useState(null);
  const [status,   setStatus]   = useState("idle");
  const [stats,    setStats]    = useState({ rows: null, columns: null, size: null });
  const [preview,  setPreview]  = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [notice,   setNotice]   = useState(""); // a file refused here, before any upload
  const [reading,  setReading]  = useState(null); // { formatLabel, notes } from the server

  // Reset when analysis completes (resetKey incremented by dashboard)
  useEffect(() => {
    if (resetKey === 0) return; // skip initial mount
    setFile(null);
    setStatus("idle");
    setStats({ rows: null, columns: null, size: null });
    setPreview(null);
    setErrorMsg("");
    setNotice("");
    setReading(null);
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
    if (!selectedFile || uploadingRef.current) return;

    // Refused here, nothing has changed: anything already uploaded still stands.
    const clearInput = () => { if (fileInputRef.current) fileInputRef.current.value = ""; };
    if (!isAcceptedFile(selectedFile.name)) {
      setNotice(t.badType(extensionOf(selectedFile.name)));
      clearInput();
      return;
    }
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setNotice(t.tooLarge);
      clearInput();
      return;
    }

    uploadingRef.current = true;
    onUploadStart?.();           // notify parent before fetch — fires on success AND fail
    setFile(selectedFile);
    setStatus("uploading");
    setErrorMsg("");
    setNotice("");
    setReading(null);

    const size = `${(selectedFile.size / 1024).toFixed(1)} KB`;
    setStats({ rows: null, columns: null, size });
    setPreview(null);

    // A plain CSV can be shown at once. Every other format waits for the
    // server's reading, because the browser cannot open it.
    const parsed = canPreviewInBrowser(selectedFile.name) ? parseCSV(await selectedFile.text()) : null;
    if (parsed) {
      setStats({ rows: parsed.totalRows.toLocaleString(), columns: parsed.totalCols, size });
      setPreview({ headers: parsed.headers, rows: parsed.rows, totalCols: parsed.totalCols });
    }

    // Send to backend to save as temp file (needed for analysis later)
    try {
      const rows    = parsed?.totalRows ?? 0;
      const columns = parsed?.totalCols ?? 0;
      const result  = guestMode
        ? await BackendAPI.guestUpload(selectedFile, guestSessionId ?? "guest", rows, columns)
        : await BackendAPI.uploadDataset(token, selectedFile, rows, columns);

      // The server's reading replaces the quick one: it handles quoted commas,
      // other delimiters and encodings, which splitting on "," does not.
      const read = previewFromUpload(result);
      if (read) setPreview(read);
      if (result?.rowCount > 0) {
        setStats({ rows: result.rowCount.toLocaleString(), columns: result.columnCount, size });
      }
      setReading({ formatLabel: result?.formatLabel ?? null, notes: result?.notes ?? [] });
      setStatus("done");
      onUploadSuccess?.(result);
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
      setErrorMsg(err?.message || "Upload failed. Try again.");
      setStats({ rows: null, columns: null, size: null });
      setPreview(null);
      clearInput();
      onUploadFailed?.();
    } finally {
      uploadingRef.current = false;
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const progressWidth = { idle: "0%", uploading: "55%", done: "100%", error: "100%" };
  const statusLabel   = { idle: t.status.idle, uploading: t.status.uploading, done: t.status.done, error: t.status.error };
  const pillClass     = status === "done" ? "ready" : status;

  return (
    <div className="card upload-card">
      <div className="card-header">
        <h2>{t.title}</h2>
        <span className={`status-pill ${pillClass}`}>{statusLabel[status]}</span>
      </div>

      <p className="muted">{t.hint}</p>

      {/* Dropzone */}
      <label
        className="upload-dropzone"
        style={{
          padding: "28px 24px",
          borderColor: dragging ? "rgba(37,99,235,0.8)" : undefined,
          background: dragging
            ? "radial-gradient(circle at top left, rgba(37,99,235,0.3), rgba(15,23,42,0.96))"
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
          accept={UPLOAD_ACCEPT}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div className="dropzone-inner">
          <div className="dropzone-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </div>
          <div>
            <p className="dropzone-title" style={{ fontSize: "1rem" }}>
              {file ? file.name : t.drop}
            </p>
            <p className="muted-small">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : t.browse}
            </p>
          </div>
        </div>
      </label>

      {notice && (
        <p role="alert" style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.5, color: "#f97373" }}>{notice}</p>
      )}

      {/* Progress bar */}
      <div className="upload-status-bar">
        <div className="status-header">
          <span style={{ color: status === "error" ? "#f97373" : undefined }}>
            {status === "idle"      && t.statusMsg.idle}
            {status === "uploading" && t.statusMsg.uploading}
            {status === "done"      && t.statusMsg.done}
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
        { label: t.stats.rows,    value: stats.rows    ?? "–" },
        { label: t.stats.columns, value: stats.columns ?? "–" },
        { label: t.stats.size,    value: stats.size    ?? "–" },
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
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#9ca3af" }}>
              {t.preview}
            </span>
            <span className="pill">
              {reading?.formatLabel ? `${reading.formatLabel} · ` : ""}
              {t.previewSub(preview.rows.length, preview.headers.length, preview.totalCols)}
            </span>
          </div>
          <div style={{
            overflowX: "auto",
            borderRadius: "12px",
            border: "1px solid rgba(31,41,55,0.9)",
            background: "rgba(15,23,42,0.96)",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(31,41,55,0.9)" }}>
                  <th style={{ padding: "8px", color: "#374151", fontWeight: 500, textAlign: "center", width: "28px", background: "rgba(2,6,23,0.6)" }}>
                    #
                  </th>
                  {preview.headers.map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", color: "#bfdbfe", fontWeight: 500, textAlign: "left", whiteSpace: "nowrap", background: "rgba(2,6,23,0.6)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(15,23,42,0.5)" : "transparent", borderBottom: "1px solid rgba(31,41,55,0.5)" }}>
                    <td style={{ padding: "6px 8px", color: "#374151", textAlign: "center", fontSize: "0.7rem" }}>
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => {
                      const isEmpty = !cell || cell === "" || cell.toLowerCase() === "na" || cell.toLowerCase() === "null";
                      return (
                        <td key={ci} style={{ padding: "6px 12px", whiteSpace: "nowrap", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", color: isEmpty ? "#f97373" : "#d1d5db" }}>
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
            {t.missing}
          </p>
          {reading?.notes?.length > 0 && (
            <ul className="muted-small" dir="auto" style={{ margin: "6px 0 0", paddingInlineStart: "16px" }}>
              {reading.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}