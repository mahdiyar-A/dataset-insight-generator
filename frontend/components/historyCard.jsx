// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";

export default function HistoryCard() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/datasets/history");
      if (!res.ok) throw new Error();
      setDatasets(await res.json());
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id) => {
    try {
      const res = await fetch(`/api/datasets/${id}/download`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `dataset_${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed. Please try again.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this dataset? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/datasets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDatasets((prev) => prev.filter((d) => d.id !== id));
    } catch {
      alert("Delete failed. Please try again.");
    }
  };

  const hasData = datasets.length > 0;

  return (
    <div className="card table-card">
      {/* Header */}
      <div className="card-header">
        <h2>Dataset History</h2>
        <span className="pill">
          {hasData ? `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}` : "No uploads yet"}
        </span>
      </div>

      {/* Table */}
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
          {loading ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#4b5563", fontSize: "0.82rem" }}>
                Loading…
              </td>
            </tr>
          ) : !hasData ? (
            /* Empty state — buttons shown but visually disabled */
            <tr>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ display: "inline-flex", padding: "4px", background: "rgba(31,41,55,0.6)", borderRadius: "6px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </span>
                  <span style={{ color: "#4b5563", fontSize: "0.82rem" }}>No datasets uploaded yet</span>
                </div>
              </td>
              <td style={{ color: "#374151" }}>—</td>
              <td style={{ color: "#374151" }}>—</td>
              <td style={{ color: "#374151" }}>—</td>
              <td className="actions-cell">
                {/* Buttons present but disabled — turn on once data exists */}
                <button className="table-action" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
                <button className="table-action delete" disabled style={{ opacity: 0.3, cursor: "not-allowed" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Delete
                </button>
              </td>
            </tr>
          ) : (
            /* Data rows — buttons fully active */
            datasets.map((d, i) => (
              <tr key={d.id ?? i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-flex", padding: "4px", background: "rgba(37,99,235,0.12)", borderRadius: "6px", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span style={{ fontWeight: 500, color: "#e5e7eb" }}>{d.name}</span>
                  </div>
                </td>
                <td>{d.rows ?? "—"}</td>
                <td>{d.columns ?? "—"}</td>
                <td>{d.size ?? "—"}</td>
                <td className="actions-cell">
                  {/* Download — active */}
                  <button
                    className="table-action"
                    onClick={() => handleDownload(d.id)}
                    style={{ borderColor: "rgba(37,99,235,0.35)", color: "#93c5fd" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download
                  </button>

                  {/* Delete — active */}
                  <button
                    className="table-action delete"
                    onClick={() => handleDelete(d.id)}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}