// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

/* ── Fallback SVG renderers (shown when backend returns image URLs we can display inline) ── */
function BarChart({ color = "#3b82f6" }) {
  const bars = [40, 65, 30, 80, 55, 70, 45, 90, 35, 60];
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 22 + 2}
          y={130 - h}
          width="17"
          height={h}
          rx="3"
          fill={color}
          opacity={0.55 + (i % 3) * 0.12}
        />
      ))}
      <line
        x1="0"
        y1="129"
        x2="220"
        y2="129"
        stroke="rgba(31,41,55,0.8)"
        strokeWidth="1"
      />
    </svg>
  );
}
function LineChart({ color = "#8b5cf6" }) {
  const pts = [10, 38, 22, 60, 42, 78, 52, 68, 62, 88, 72, 48, 82, 92];
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * 210 + 5);
  const ys = pts.map((y) => 125 - y);
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      <defs>
        <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={`${xs[0]},125 ${line} ${xs[xs.length - 1]},125`}
        fill="url(#lc)"
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={color} />
      ))}
    </svg>
  );
}
function Heatmap() {
  const palette = ["#0f172a", "#1e3a5f", "#1d4ed8", "#3b82f6", "#93c5fd"];
  const cells = Array.from({ length: 25 }, (_, i) => {
    const v = Math.abs(Math.sin(i * 0.7 + 1.3));
    return palette[Math.floor(v * palette.length)];
  });
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {cells.map((c, i) => (
        <rect
          key={i}
          x={(i % 5) * 44}
          y={Math.floor(i / 5) * 26}
          width="42"
          height="24"
          rx="3"
          fill={c}
        />
      ))}
    </svg>
  );
}
function ScatterPlot({ color = "#f59e0b" }) {
  const seed = (n) => (((Math.sin(n) * 43758.5453) % 1) + 1) % 1;
  const pts = Array.from({ length: 28 }, (_, i) => [
    seed(i * 3.1) * 208 + 6,
    seed(i * 7.3) * 118 + 6,
  ]);
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={color} opacity="0.65" />
      ))}
      <line
        x1="0"
        y1="129"
        x2="220"
        y2="129"
        stroke="rgba(31,41,55,0.8)"
        strokeWidth="1"
      />
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="130"
        stroke="rgba(31,41,55,0.8)"
        strokeWidth="1"
      />
    </svg>
  );
}
function AreaChart({ color = "#10b981" }) {
  const pts = [5, 18, 32, 22, 48, 38, 62, 52, 78, 68, 88, 72];
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * 210 + 5);
  const ys = pts.map((y) => 125 - y);
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 220 130" width="100%" height="100%">
      <defs>
        <linearGradient id="ac" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={`${xs[0]},125 ${line} ${xs[xs.length - 1]},125`}
        fill="url(#ac)"
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Fallback chart renderers used when backend returns no URL
const SVG_FALLBACKS = [
  {
    type: "bar",
    label: "Distribution",
    Chart: BarChart,
    color: "#3b82f6",
    desc: "Column value frequencies",
  },
  {
    type: "heatmap",
    label: "Correlation",
    Chart: Heatmap,
    color: "#8b5cf6",
    desc: "Feature correlation matrix",
  },
  {
    type: "scatter",
    label: "Outliers",
    Chart: ScatterPlot,
    color: "#f59e0b",
    desc: "Anomaly scatter patterns",
  },
  {
    type: "line",
    label: "Trends",
    Chart: LineChart,
    color: "#8b5cf6",
    desc: "Time-series trends",
  },
  {
    type: "area",
    label: "Growth",
    Chart: AreaChart,
    color: "#10b981",
    desc: "Cumulative trend view",
  },
];

export default function ChartsCard({ dataset }) {
  const { token } = useAuth();
  const [charts, setCharts] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);

  // Re-fetch whenever dataset changes (new upload clears, existing load pulls)
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchCharts();
  }, [token, dataset?.id]);

  const fetchCharts = async () => {
    setLoading(true);
    setActive(0);
    try {
      // Backend returns array of up to 5:
      // [{ type, label, url, desc, color? }, ...]
      // If analysis not done yet → empty array → we show "pending" state
      const data = await BackendAPI.getVisualizations(token);

      if (!data || data.length === 0) {
        setCharts([]);
      } else {
        // Merge backend data with SVG fallbacks for any chart without a URL
        const merged = data.slice(0, 5).map((c, i) => ({
          ...SVG_FALLBACKS[i % SVG_FALLBACKS.length],
          ...c, // backend fields override fallback (url, label, color, desc)
        }));
        setCharts(merged);
      }
    } catch {
      setCharts([]);
    } finally {
      setLoading(false);
    }
  };

  // Clamp active index if charts changed
  useEffect(() => {
    if (active >= charts.length && charts.length > 0) setActive(0);
  }, [charts]);

  const current = charts[active];
  const currentColor = current?.color || "#3b82f6";
  const hasUrl = !!current?.url;

  return (
    <div className="card chart-card">
      <div className="card-header">
        <h2>Visualizations</h2>
        {current ? (
          <span
            className="pill"
            style={{
              borderColor: `${currentColor}44`,
              color: currentColor,
              background: `${currentColor}14`,
            }}
          >
            {current.label}
          </span>
        ) : (
          <span className="pill">
            {loading ? "Loading…" : dataset ? "Pending analysis" : "No dataset"}
          </span>
        )}
      </div>

      {/* Chart display area */}
      <div
        style={{
          background:
            "radial-gradient(circle at top, rgba(37,99,235,0.06), rgba(15,23,42,0.96))",
          borderRadius: "14px",
          border: "1px solid rgba(31,41,55,0.9)",
          minHeight: "200px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
            }}
          >
            <p className="muted-small">Loading…</p>
          </div>
        ) : charts.length === 0 ? (
          /* ── No charts: different messages for no-dataset vs pending analysis ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              padding: "40px",
              minHeight: "200px",
              textAlign: "center",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(55,65,81,0.8)"
              strokeWidth="1.4"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            {!dataset ? (
              <>
                <p
                  style={{
                    margin: 0,
                    color: "#4b5563",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  No visualizations yet
                </p>
                <p className="muted-small">
                  Upload and analyse a dataset to generate charts.
                </p>
              </>
            ) : (
              <>
                <p
                  style={{
                    margin: 0,
                    color: "#4b5563",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  Charts pending
                </p>
                <p className="muted-small">
                  Run the analysis to generate up to 5 visualizations.
                </p>
              </>
            )}
          </div>
        ) : (
          /* ── Active chart ── */
          <>
            <div
              style={{
                padding: "14px 16px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#9ca3af",
                }}
              >
                Chart {active + 1} of {charts.length} — {current.label}
              </span>
              <span className="muted-small">{current.desc}</span>
            </div>

            <div
              style={{ flex: 1, padding: "12px 16px 16px", minHeight: "160px" }}
            >
              {hasUrl ? (
                /* Real image from Supabase Storage */
                <img
                  src={current.url}
                  alt={current.label}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    borderRadius: "8px",
                    maxHeight: "200px",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                /* SVG placeholder until real image is ready */
                <current.Chart color={currentColor} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Nav dots */}
      {charts.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            marginTop: "4px",
          }}
        >
          {charts.map((c, i) => {
            const dotColor = c.color || "#3b82f6";
            const isActive = active === i;
            return (
              <button
                key={i}
                title={`Chart ${i + 1}: ${c.label}`}
                onClick={() => setActive(i)}
                style={{
                  width: isActive ? "26px" : "10px",
                  height: "10px",
                  borderRadius: "5px",
                  border: `2px solid ${isActive ? dotColor : "rgba(55,65,81,0.8)"}`,
                  background: isActive ? dotColor : "transparent",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.25s ease",
                  boxShadow: isActive ? `0 0 8px ${dotColor}88` : "none",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Tab labels */}
      {charts.length > 0 && (
        <div
          style={{
            display: "flex",
            borderTop: "1px solid rgba(31,41,55,0.9)",
            marginTop: "4px",
          }}
        >
          {charts.map((c, i) => {
            const tabColor = c.color || "#3b82f6";
            const isActive = active === i;
            return (
              <button
                key={i}
                onClick={() => setActive(i)}
                style={{
                  flex: 1,
                  padding: "9px 4px",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive
                    ? `2px solid ${tabColor}`
                    : "2px solid transparent",
                  color: isActive ? tabColor : "#4b5563",
                  fontSize: "0.72rem",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "color 0.2s, border-color 0.2s",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
