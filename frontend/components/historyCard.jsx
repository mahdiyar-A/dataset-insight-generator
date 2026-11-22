// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useAuth }    from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI     from "@/lib/BackendAPI";

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    title:       "History",
    empty:       "No completed analyses yet.",
    emptyHint:   "Upload a dataset and run analysis to see results here.",
    load:        "Load into dashboard",
    delete:      "Delete",
    confirm:     "Delete this analysis? This cannot be undone.",
    rows:        "rows",
    cols:        "cols",
    limit:       (n) => `${n} slot limit`,
    free:        "Free",
    pro:         "Pro",
    upgradeHint: "Upgrade to Pro for 15 history slots →",
  },
  fr: {
    title:       "Historique",
    empty:       "Aucune analyse complétée.",
    emptyHint:   "Importez un dataset et lancez une analyse pour voir les résultats ici.",
    load:        "Charger dans le tableau de bord",
    delete:      "Supprimer",
    confirm:     "Supprimer cette analyse ? Cette action est irréversible.",
    rows:        "lignes",
    cols:        "colonnes",
    limit:       (n) => `${n} espaces`,
    free:        "Gratuit",
    pro:         "Pro",
    upgradeHint: "Passer à Pro pour 15 espaces →",
  },
  fa: {
    title:       "تاریخچه",
    empty:       "هنوز تحلیلی کامل نشده.",
    emptyHint:   "یک دیتاست آپلود کنید و تحلیل را اجرا کنید.",
    load:        "بارگذاری در داشبورد",
    delete:      "حذف",
    confirm:     "این تحلیل حذف شود؟",
    rows:        "ردیف",
    cols:        "ستون",
    limit:       (n) => `${n} اسلات`,
    free:        "رایگان",
    pro:         "حرفه‌ای",
    upgradeHint: "برای ۱۵ اسلات به Pro ارتقا دهید →",
  },
};

function fmt(bytes) {
  if (!bytes) return "—";
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  }) + " · " + new Date(iso).toLocaleTimeString("en-CA", {
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * HistoryCard — shows the user's last N analyses (5 free / 15 pro).
 *
 * Props:
 *   history      — array of analysis objects (from /api/analyses/history)
 *   activeId     — id of the currently loaded analysis (highlight it)
 *   plan         — "free" | "pro" | "admin"
 *   onLoad       — (analysis) → void  called when user clicks "Load"
 *   onDeleted    — (analysisId) → void  called after a delete succeeds
 *   onUpgrade    — () → void  called when user clicks the upgrade hint
 */
/**
 * `history = []` alone infers `never[]`, so passing a real Analysis[] from the
 * dashboard failed the production type check.
 *
 * @param {{
 *   history?: import("@/lib/types").Analysis[],
 *   activeId?: string,
 *   plan?: string,
 *   onLoad?: (item: import("@/lib/types").Analysis) => void,
 *   onDeleted?: (id: string) => void,
 *   onUpgrade?: () => void,
 * }} props
 */
export default function HistoryCard({
  history = [],
  activeId,
  plan = "free",
  onLoad,
  onDeleted,
  onUpgrade,
}) {
  const { token }  = useAuth();
  const { lang }   = useSettings();
  const t          = T[lang] || T.en;
  const [deleting, setDeleting] = useState(null); // analysisId being deleted

  const limit     = plan === "pro" || plan === "admin" ? 15 : 5;
  const isPro     = plan === "pro" || plan === "admin";

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm(t.confirm)) return;
    setDeleting(id);
    try {
      await BackendAPI.deleteAnalysis(token, id);
      onDeleted?.(id);
    } catch (err) {
      alert(err.message || "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="card table-card">
      {/* Header */}
      <div className="card-header">
        <h2>{t.title}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="pill">{history.length} / {limit}</span>
          <span style={{
            padding: "3px 10px", borderRadius: "0", fontSize: "0.72rem",
            fontWeight: 700,
            background: isPro ? "color-mix(in srgb, var(--cobalt) 15%, transparent)" : "color-mix(in srgb, var(--card) 50%, transparent)",
            border:     isPro ? "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)" : "1px solid var(--line)",
            color:      isPro ? "var(--cobalt-accent)" : "var(--ink-faint)",
          }}>
            {isPro ? t.pro : t.free}
          </span>
        </div>
      </div>

      {/* Upgrade nudge for free users */}
      {!isPro && history.length >= 4 && (
        <button
          onClick={onUpgrade}
          style={{
            display:    "block", width: "100%", textAlign: "left",
            padding:    "10px 14px", borderRadius: "0", marginBottom: "12px",
            background: "color-mix(in srgb, var(--warn) 6%, transparent)",
            border:     "1px solid color-mix(in srgb, var(--warn) 35%, transparent)",
            color:      "var(--warn-text)", fontSize: "0.78rem", cursor: "pointer",
          }}>
          ⚡ {t.upgradeHint}
        </button>
      )}

      {/* Empty state */}
      {history.length === 0 ? (
        <div style={{
          padding:    "32px 16px", textAlign: "center",
          color:      "var(--ink-faint)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.4 }}>📂</div>
          <p style={{ margin: "0 0 4px", fontSize: "0.88rem" }}>{t.empty}</p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-faint)" }}>{t.emptyHint}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {history.map((analysis) => {
            const isActive  = analysis.id === activeId;
            const isDeleting = deleting === analysis.id;

            return (
              <div
                key={analysis.id}
                onClick={() => !isDeleting && onLoad?.(analysis)}
                style={{
                  padding:    "14px 16px",
                  borderRadius: "0",
                  border:     isActive
                    ? "1px solid var(--cobalt-accent)"
                    : "1px solid var(--line)",
                  background: isActive
                    ? "color-mix(in srgb, var(--cobalt) 8%, transparent)"
                    : "color-mix(in srgb, var(--card) 60%, transparent)",
                  cursor:     isDeleting ? "not-allowed" : "pointer",
                  opacity:    isDeleting ? 0.5 : 1,
                  transition: "border-color 0.15s, background 0.15s",
                  display:    "flex", alignItems: "center", gap: "12px",
                }}>

                {/* File icon */}
                <span style={{
                  display: "inline-flex", padding: "6px",
                  background: isActive
                    ? "color-mix(in srgb, var(--cobalt) 15%, transparent)" : "color-mix(in srgb, var(--card) 60%, transparent)",
                  borderRadius: "0", flexShrink: 0,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={isActive ? "#60a5fa" : "#4b5563"} strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: "0 0 3px", fontWeight: 600, fontSize: "0.88rem",
                    color: isActive ? "var(--cobalt-accent)" : "var(--ink)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {analysis.fileName ?? "—"}
                  </p>
                  <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.75rem" }}>
                    {analysis.rowCount?.toLocaleString() ?? "—"} {t.rows} ·{" "}
                    {analysis.columnCount ?? "—"} {t.cols} ·{" "}
                    {fmt(analysis.fileSizeBytes)}
                  </p>
                  <p style={{ margin: "2px 0 0", color: "var(--ink-faint)", fontSize: "0.72rem" }}>
                    {fmtDate(analysis.completedAt || analysis.createdAt)}
                  </p>
                </div>

                {/* Badges */}
                <div style={{ display: "flex", flexDirection: "column",
                  alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>

                  {isActive && (
                    <span style={{
                      padding: "2px 8px", borderRadius: "0", fontSize: "0.68rem",
                      fontWeight: 700,
                      background: "color-mix(in srgb, var(--cobalt) 15%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)", color: "var(--cobalt-accent)",
                    }}>
                      Active
                    </span>
                  )}

                  {/* File type badges */}
                  <div style={{ display: "flex", gap: "3px" }}>
                    {analysis.hasPdfReport  && <Badge label="PDF"  />}
                    {analysis.hasWordReport && <Badge label="Word" color="blue" />}
                    {analysis.hasPptx       && <Badge label="PPT"  color="orange" />}
                    {analysis.hasCleanedCsv && <Badge label="CSV"  color="green" />}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => handleDelete(e, analysis.id)}
                  disabled={isDeleting}
                  title="Delete"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--ink-faint)", padding: "4px", borderRadius: "0",
                    flexShrink: 0, lineHeight: 1,
                  }}>
                  {isDeleting ? "…" : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ label, color = "gray" }) {
  const styles = {
    gray:   { bg: "color-mix(in srgb, var(--card) 50%, transparent)",    border: "var(--line)",    color: "var(--ink-faint)" },
    blue:   { bg: "color-mix(in srgb, var(--cobalt) 12%, transparent)",  border: "color-mix(in srgb, var(--cobalt) 35%, transparent)",  color: "var(--cobalt-accent)" },
    green:  { bg: "color-mix(in srgb, var(--ok) 10%, transparent)",  border: "color-mix(in srgb, var(--ok) 35%, transparent)",  color: "var(--ok-text)" },
    orange: { bg: "color-mix(in srgb, var(--warn) 10%, transparent)",  border: "color-mix(in srgb, var(--warn) 35%, transparent)",  color: "var(--warn-text)" },
  }[color] ?? {};
  return (
    <span style={{
      padding: "1px 5px", borderRadius: "0", fontSize: "0.62rem", fontWeight: 700,
      background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color,
    }}>
      {label}
    </span>
  );
}
