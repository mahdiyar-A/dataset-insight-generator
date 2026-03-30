// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

/* ── Fallback SVG renderers ────────────────────────────────────────────────── */
function BarChart({ color = "#3b82f6" }) {
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
function LineChart({ color = "#ec4899" }) {
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
function ScatterPlot({ color = "#f97316" }) {
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
function AreaChart({ color = "#10b981" }) {
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
  { type: "bar",     label: "Distribution", Chart: BarChart,    color: "#3b82f6", desc: "Column value frequencies"   },
  { type: "heatmap", label: "Correlation",  Chart: Heatmap,     color: "#a855f7", desc: "Feature correlation matrix" },
  { type: "scatter", label: "Outliers",     Chart: ScatterPlot, color: "#f97316", desc: "Anomaly scatter patterns"   },
  { type: "line",    label: "Trends",       Chart: LineChart,   color: "#ec4899", desc: "Time-series trends"         },
  { type: "area",    label: "Growth",       Chart: AreaChart,   color: "#10b981", desc: "Cumulative trend view"      },
];

/* ── Zoom / lightbox modal ─────────────────────────────────────────────────── */
function ZoomModal({ chart, imgSrc, onClose }) {
  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const color = chart?.color || "#3b82f6";
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(2,6,23,0.88)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0a1628",
          border: `1px solid ${color}44`,
          borderRadius: "20px",
          padding: "20px",
          width: "min(900px, 95vw)",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column", gap: "14px",
          boxShadow: `0 0 60px ${color}22, 0 24px 60px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "#e2e8f0", fontSize: "0.95rem" }}>
              {chart?.label}
            </p>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.78rem", marginTop: "2px" }}>
              {chart?.desc}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(15,23,42,0.9)", border: "1px solid rgba(55,65,81,0.8)",
              borderRadius: "8px", padding: "7px", color: "#6b7280",
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
          flex: 1, borderRadius: "12px", overflow: "hidden",
          border: `1px solid ${color}22`,
          background: "radial-gradient(circle at top, rgba(37,99,235,0.06), rgba(10,22,40,0.98))",
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "420px",
        }}>
          {imgSrc ? (
            <img src={imgSrc} alt={chart?.label}
              style={{ maxWidth: "100%", maxHeight: "520px", objectFit: "contain", borderRadius: "8px" }} />
          ) : (
            <div style={{ width: "100%", height: "420px", padding: "24px" }}>
              {chart?.Chart && <chart.Chart color={color} />}
            </div>
          )}
        </div>

        <p style={{ margin: 0, textAlign: "center", color: "#475569", fontSize: "0.75rem" }}>
          Press Esc or click outside to close
        </p>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function ChartsCard({ dataset, charts: guestCharts = null, reportReady: guestReportReady = false }) {
  const { token } = useAuth();
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
    setLoading(true); setActive(0);
    try {
      const data = await BackendAPI.getVisualizations(token);
      setCharts(data?.length ? mergeWithFallbacks(data) : []);
    } catch { setCharts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (active >= charts.length && charts.length > 0) setActive(0);
  }, [charts]);

  const closeZoom = useCallback(() => setZoomedIdx(null), []);

  const current      = charts[active];
  const currentColor = current?.color || "#3b82f6";
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
        <ZoomModal chart={zoomedChart} imgSrc={zoomedImgSrc} onClose={closeZoom} />
      )}

      <div className="card chart-card">
        <div className="card-header">
          <h2>Visualizations</h2>
          {current ? (
            <span className="pill" style={{ borderColor: `${currentColor}44`, color: currentColor, background: `${currentColor}14` }}>
              {current.label}
            </span>
          ) : (
            <span className="pill">
              {loading ? "Loading…" : dataset ? "Pending analysis" : "No dataset"}
            </span>
          )}
        </div>

        {/* ── Chart display area ── */}
        <div style={{
          background: "radial-gradient(circle at top, rgba(37,99,235,0.06), rgba(15,23,42,0.96))",
          borderRadius: "14px",
          border: "1px solid rgba(31,41,55,0.9)",
          minHeight: "260px",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "260px" }}>
              <p className="muted-small">Loading…</p>
            </div>

          ) : charts.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "40px", minHeight: "260px", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(55,65,81,0.8)" strokeWidth="1.4">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              {!dataset ? (
                <>
                  <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", fontWeight: 600 }}>No visualizations yet</p>
                  <p className="muted-small">Upload and analyse a dataset to generate charts.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", fontWeight: 600 }}>Charts pending</p>
                  <p className="muted-small">Run the analysis to generate up to 5 visualizations.</p>
                </>
              )}
            </div>

          ) : (
            <>
              {/* Info bar */}
              <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#9ca3af" }}>
                  Chart {active + 1} of {charts.length} — {current.label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="muted-small" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {current.desc}
                  </span>
                  {/* Zoom button */}
                  <button
                    onClick={() => setZoomedIdx(active)}
                    title="Zoom in"
                    style={{
                      background: `${currentColor}18`, border: `1px solid ${currentColor}44`,
                      borderRadius: "6px", padding: "4px 8px", color: currentColor,
                      fontSize: "0.7rem", fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "4px", flexShrink: 0,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                    Zoom
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
                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }}
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
                  background: "rgba(0,0,0,0.55)", borderRadius: "6px",
                  padding: "3px 8px", color: "#94a3b8", fontSize: "0.68rem",
                  pointerEvents: "none", opacity: 0.8,
                }}>
                  click to zoom
                </div>
              </div>
            </>
          )}
        </div>

        {/* Nav dots */}
        {charts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "4px" }}>
            {charts.map((c, i) => {
              const dotColor = c.color || "#3b82f6";
              const isActive = active === i;
              return (
                <button key={i} title={`Chart ${i + 1}: ${c.label}`} onClick={() => setActive(i)}
                  style={{
                    width: isActive ? "26px" : "10px", height: "10px", borderRadius: "5px",
                    border: `2px solid ${isActive ? dotColor : "rgba(55,65,81,0.8)"}`,
                    background: isActive ? dotColor : "transparent",
                    cursor: "pointer", padding: 0, transition: "all 0.25s ease",
                    boxShadow: isActive ? `0 0 8px ${dotColor}88` : "none",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Tab labels */}
        {charts.length > 0 && (
          <div style={{ display: "flex", borderTop: "1px solid rgba(31,41,55,0.9)", marginTop: "4px" }}>
            {charts.map((c, i) => {
              const tabColor = c.color || "#3b82f6";
              const isActive = active === i;
              return (
                <button key={i} onClick={() => setActive(i)}
                  style={{
                    flex: 1, padding: "9px 4px", background: "transparent", border: "none",
                    borderBottom: isActive ? `2px solid ${tabColor}` : "2px solid transparent",
                    color: isActive ? tabColor : "#4b5563",
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