// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";

const T = {
  en: {
    title: "Visualizations",
    loading: "Loading…",
    pendingAnalysis: "Pending analysis",
    noDataset: "No dataset",
    noVizYet: "No visualizations yet",
    uploadHint: "Upload and analyse a dataset to generate charts.",
    chartsPending: "Charts pending",
    runHint: "Run the analysis to generate up to 5 visualizations.",
    chartOf: (a, b) => `Chart ${a} of ${b}`,
    clickZoom: "click to zoom",
    zoom: "Zoom",
    escClose: "Press Esc or click outside to close",
  },
  fr: {
    title: "Visualisations",
    loading: "Chargement…",
    pendingAnalysis: "Analyse en attente",
    noDataset: "Aucun jeu de données",
    noVizYet: "Aucune visualisation pour l'instant",
    uploadHint: "Importez et analysez un jeu de données pour générer des graphiques.",
    chartsPending: "Graphiques en attente",
    runHint: "Lancez l'analyse pour générer jusqu'à 5 visualisations.",
    chartOf: (a, b) => `Graphique ${a} sur ${b}`,
    clickZoom: "cliquer pour zoomer",
    zoom: "Zoom",
    escClose: "Appuyez sur Échap ou cliquez en dehors pour fermer",
  },
  fa: {
    title: "تصویرسازی‌ها",
    loading: "در حال بارگذاری…",
    pendingAnalysis: "در انتظار تحلیل",
    noDataset: "مجموعه داده‌ای وجود ندارد",
    noVizYet: "هنوز تصویرسازی‌ای وجود ندارد",
    uploadHint: "یک مجموعه داده بارگذاری و تحلیل کنید تا نمودارها تولید شوند.",
    chartsPending: "نمودارها در انتظار",
    runHint: "تحلیل را اجرا کنید تا حداکثر ۵ تصویرسازی تولید شود.",
    chartOf: (a, b) => `نمودار ${a} از ${b}`,
    clickZoom: "برای بزرگ‌نمایی کلیک کنید",
    zoom: "بزرگ‌نمایی",
    escClose: "Esc را فشار دهید یا بیرون از کادر کلیک کنید تا بسته شود",
  },
};

/* ── Fallback SVG renderers ────────────────────────────────────────────────── */
function BarChart({ color = "var(--cobalt-accent)" }) {
  const bars = [40, 65, 30, 80, 55, 70, 45, 90, 35, 60];
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {bars.map((h, i) => (
        <rect key={i} x={i * 22 + 2} y={130 - h} width="17" height={h} rx="3"
          fill={color} opacity={0.55 + (i % 3) * 0.12} />
      ))}
      <line x1="0" y1="129" x2="220" y2="129" stroke="rgba(31,41,55,0.8)" strokeWidth="1" />
    </svg>
  );
}
function LineChart({ color = "var(--cobalt-accent)" }) {
  const pts = [10, 38, 22, 60, 42, 78, 52, 68, 62, 88, 72, 48, 82, 92];
  const xs  = pts.map((_, i) => (i / (pts.length - 1)) * 210 + 5);
  const ys  = pts.map((y) => 125 - y);
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      <defs>
        <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline points={`${xs[0]},125 ${line} ${xs[xs.length-1]},125`} fill="url(#lc)" stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={color} />)}
    </svg>
  );
}
function Heatmap() {
  const palette = ["#0f172a", "#1e3a5f", "#1d4ed8", "#3b82f6", "#93c5fd"];
  const cells   = Array.from({ length: 25 }, (_, i) => {
    const v = Math.abs(Math.sin(i * 0.7 + 1.3));
    return palette[Math.floor(v * palette.length)];
  });
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {cells.map((c, i) => (
        <rect key={i} x={(i % 5) * 44} y={Math.floor(i / 5) * 26} width="42" height="24" rx="3" fill={c} />
      ))}
    </svg>
  );
}
function ScatterPlot({ color = "var(--warn-text)" }) {
  const seed = (n) => (((Math.sin(n) * 43758.5453) % 1) + 1) % 1;
  const pts  = Array.from({ length: 28 }, (_, i) => [seed(i * 3.1) * 208 + 6, seed(i * 7.3) * 118 + 6]);
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill={color} opacity="0.65" />)}
      <line x1="0"  y1="129" x2="220" y2="129" stroke="rgba(31,41,55,0.8)" strokeWidth="1" />
      <line x1="1"  y1="0"   x2="1"   y2="130" stroke="rgba(31,41,55,0.8)" strokeWidth="1" />
    </svg>
  );
}
function AreaChart({ color = "var(--ok-text)" }) {
  const pts  = [5, 18, 32, 22, 48, 38, 62, 52, 78, 68, 88, 72];
  const xs   = pts.map((_, i) => (i / (pts.length - 1)) * 210 + 5);
  const ys   = pts.map((y) => 125 - y);
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      <defs>
        <linearGradient id="ac" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline points={`${xs[0]},125 ${line} ${xs[xs.length-1]},125`} fill="url(#ac)" stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SVG_FALLBACKS = [
  { type: "bar",     label: "Distribution", Chart: BarChart,    color: "var(--cobalt-accent)", desc: "Column value frequencies"   },
  { type: "heatmap", label: "Correlation",  Chart: Heatmap,     color: "var(--cobalt-accent)", desc: "Feature correlation matrix" },
  { type: "scatter", label: "Outliers",     Chart: ScatterPlot, color: "var(--warn-text)", desc: "Anomaly scatter patterns"   },
  { type: "line",    label: "Trends",       Chart: LineChart,   color: "var(--cobalt-accent)", desc: "Time-series trends"         },
  { type: "area",    label: "Growth",       Chart: AreaChart,   color: "var(--ok-text)", desc: "Cumulative trend view"      },
];

/* ── Zoom / lightbox modal ─────────────────────────────────────────────────── */
function ZoomModal({ chart, imgSrc, onClose, escClose }) {
  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const color = chart?.color || "var(--cobalt-accent)";
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "var(--card)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
          borderRadius: "0",
          padding: "20px",
          width: "min(900px, 95vw)",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column", gap: "14px",
          boxShadow: `0 0 60px color-mix(in srgb, ${color} 13%, transparent), 0 24px 60px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem" }}>
              {chart?.label}
            </p>
            <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.78rem", marginTop: "2px" }}>
              {chart?.desc}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--card)", border: "1px solid var(--line)",
              borderRadius: "0", padding: "7px", color: "var(--ink-faint)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Chart — large */}
        <div style={{
          flex: 1, borderRadius: "0", overflow: "hidden",
          border: `1px solid color-mix(in srgb, ${color} 13%, transparent)`,
          background: "radial-gradient(circle at top, color-mix(in srgb, var(--cobalt) 6%, transparent), var(--card))",
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "420px",
        }}>
          {imgSrc ? (
            <img src={imgSrc} alt={chart?.label}
              style={{ maxWidth: "100%", maxHeight: "520px", objectFit: "contain", borderRadius: "0"}} />
          ) : (
            <div style={{ width: "100%", height: "420px", padding: "24px" }}>
              {chart?.Chart && <chart.Chart color={color} />}
            </div>
          )}
        </div>

        <p style={{ margin: 0, textAlign: "center", color: "var(--ink-faint)", fontSize: "0.75rem" }}>
          {escClose}
        </p>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */
/**
 * `charts: guestCharts = null` alone infers `null`, so the guest dashboard
 * passing a real ChartMeta[] failed the production type check.
 *
 * @param {{
 *   dataset?: import("@/lib/types").Analysis | import("@/lib/types").UploadedFileMeta | null,
 *   charts?: import("@/lib/types").ChartMeta[] | null,
 *   reportReady?: boolean,
 * }} props
 */
export default function ChartsCard({ dataset, charts: guestCharts = null, reportReady: guestReportReady = false }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;

  const [charts,    setCharts]    = useState([]);
  const [active,    setActive]    = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [zoomedIdx, setZoomedIdx] = useState(null); // index of zoomed chart, or null

  const mergeWithFallbacks = (data) =>
    (data ?? []).slice(0, 5).map((c, i) => ({
      ...SVG_FALLBACKS[i % SVG_FALLBACKS.length],
      ...c,
    }));

  // Guest mode
  useEffect(() => {
    if (guestCharts !== null) {
      setCharts(mergeWithFallbacks(guestCharts));
      setActive(0);
      setLoading(false);
    }
  }, [guestCharts]);

  // Auth mode
  useEffect(() => {
    if (guestCharts !== null) return;
    if (!token) { setLoading(false); return; }
    // New upload in progress — clear stale charts immediately, don't fetch
    if (dataset?.isPending) { setCharts([]); setActive(0); setLoading(false); return; }
    fetchCharts();
  }, [token, dataset?.id, dataset?.isPending]); // eslint-disable-line

  const fetchCharts = async () => {
    setActive(0);
    if (!dataset?.id) { setCharts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await BackendAPI.getVisualizations(token, dataset.id);
      setCharts(data?.length ? mergeWithFallbacks(data) : []);
    } catch { setCharts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (active >= charts.length && charts.length > 0) setActive(0);
  }, [charts]);

  const closeZoom = useCallback(() => setZoomedIdx(null), []);

  const current      = charts[active];
  const currentColor = current?.color || "var(--cobalt-accent)";
  const hasUrl       = !!current?.url;
  const hasB64       = !!current?.image_base64;
  const hasRealImg   = hasUrl || hasB64;
  const imgSrc       = hasUrl ? current.url
                     : hasB64 ? `data:image/png;base64,${current.image_base64}`
                     : null;

  const zoomedChart  = zoomedIdx !== null ? charts[zoomedIdx] : null;
  const zoomedImgSrc = zoomedIdx !== null ? (
    charts[zoomedIdx]?.url
      ? charts[zoomedIdx].url
      : charts[zoomedIdx]?.image_base64
        ? `data:image/png;base64,${charts[zoomedIdx].image_base64}`
        : null
  ) : null;

  return (
    <>
      {zoomedIdx !== null && (
        <ZoomModal chart={zoomedChart} imgSrc={zoomedImgSrc} onClose={closeZoom} escClose={t.escClose} />
      )}

      <div className="card chart-card">
        <div className="card-header">
          <h2>{t.title}</h2>
          {current ? (
            <span className="pill" style={{ borderColor: `color-mix(in srgb, ${currentColor} 27%, transparent)`, color: currentColor, background: `color-mix(in srgb, ${currentColor} 8%, transparent)` }}>
              {current.label}
            </span>
          ) : (
            <span className="pill">
              {loading ? t.loading : dataset ? t.pendingAnalysis : t.noDataset}
            </span>
          )}
        </div>

        {/* ── Chart display area ── */}
        <div style={{
          background: "radial-gradient(circle at top, color-mix(in srgb, var(--cobalt) 6%, transparent), var(--card))",
          borderRadius: "0",
          border: "1px solid var(--line)",
          minHeight: "260px",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "260px" }}>
              <p className="muted-small">{t.loading}</p>
            </div>

          ) : charts.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "40px", minHeight: "260px", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--line)" strokeWidth="1.4">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              {!dataset ? (
                <>
                  <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.85rem", fontWeight: 600 }}>{t.noVizYet}</p>
                  <p className="muted-small">{t.uploadHint}</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.85rem", fontWeight: 600 }}>{t.chartsPending}</p>
                  <p className="muted-small">{t.runHint}</p>
                </>
              )}
            </div>

          ) : (
            <>
              {/* Info bar */}
              <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                  {t.chartOf(active + 1, charts.length)} — {current.label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="muted-small" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {current.desc}
                  </span>
                  {/* Zoom button */}
                  <button
                    onClick={() => setZoomedIdx(active)}
                    title={t.zoom}
                    style={{
                      background: `color-mix(in srgb, ${currentColor} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${currentColor} 27%, transparent)`,
                      borderRadius: "0", padding: "4px 8px", color: currentColor,
                      fontSize: "0.7rem", fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "4px", flexShrink: 0,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                    {t.zoom}
                  </button>
                </div>
              </div>

              {/* Chart image — clickable to zoom */}
              <div
                onClick={() => setZoomedIdx(active)}
                style={{
                  padding: "12px 16px 16px",
                  height: "290px",
                  cursor: "zoom-in",
                  position: "relative",
                }}
              >
                {hasRealImg ? (
                  <img
                    src={imgSrc}
                    alt={current.label}
                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "0"}}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%" }}>
                    <current.Chart color={currentColor} />
                  </div>
                )}
                {/* Hover hint overlay */}
                <div style={{
                  position: "absolute", bottom: "20px", right: "24px",
                  background: "color-mix(in srgb, var(--card) 55%, transparent)", borderRadius: "0",
                  padding: "3px 8px", color: "var(--ink-soft)", fontSize: "0.68rem",
                  pointerEvents: "none", opacity: 0.8,
                }}>
                  {t.clickZoom}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Nav dots */}
        {charts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "4px" }}>
            {charts.map((c, i) => {
              const dotColor = c.color || "var(--cobalt-accent)";
              const isActive = active === i;
              return (
                <button key={i} title={`${i + 1}: ${c.label}`} onClick={() => setActive(i)}
                  style={{
                    width: isActive ? "26px" : "10px", height: "10px", borderRadius: "0",
                    border: `2px solid ${isActive ? dotColor : "var(--line)"}`,
                    background: isActive ? dotColor : "transparent",
                    cursor: "pointer", padding: 0, transition: "all 0.25s ease",
                    boxShadow: isActive ? `0 0 8px color-mix(in srgb, ${dotColor} 53%, transparent)` : "none",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Tab labels */}
        {charts.length > 0 && (
          <div style={{ display: "flex", borderTop: "1px solid var(--line)", marginTop: "4px" }}>
            {charts.map((c, i) => {
              const tabColor = c.color || "var(--cobalt-accent)";
              const isActive = active === i;
              return (
                <button key={i} onClick={() => setActive(i)}
                  style={{
                    flex: 1, padding: "9px 4px", background: "transparent",
                    borderWidth: "0 0 2px", borderStyle: "solid",
                    borderColor: isActive ? tabColor : "transparent",
                    color: isActive ? tabColor : "var(--ink-soft)",
                    fontSize: "0.72rem", fontWeight: isActive ? 700 : 500,
                    cursor: "pointer", transition: "color 0.2s, border-color 0.2s",
                    letterSpacing: "0.02em", whiteSpace: "nowrap",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
