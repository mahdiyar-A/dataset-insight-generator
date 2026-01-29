"use client";

import React, { useState, useEffect } from "react";

export default function ChartsCard() {
  const [datasets, setDatasets] = useState([]);

  useEffect(() => {
    fetchCharts();
  }, []);

  const fetchCharts = async () => {
    try {
      const res = await fetch("/api/datasets/history");
      if (!res.ok) throw new Error("Failed to fetch datasets");
      const data = await res.json();
      setDatasets(data);
    } catch (err) {
      console.error(err);
      setDatasets([]);
    }
  };

  // Pick first 3 datasets for demo
  const chartDatasets = datasets.slice(0, 3);
  const emptyDatasets = chartDatasets.length < 3 ? Array(3 - chartDatasets.length).fill({ id: null, name: "No dataset" }) : [];

  const displayDatasets = [...chartDatasets, ...emptyDatasets];

  const handleViewReport = (id) => {
    alert(id ? `View report for dataset ${id} (mock)` : "No dataset");
  };

  return (
    <div className="card charts-card">
      <div className="card-header">
        <h2>Dataset Analysis Charts</h2>
        <span className="pill">Visualizations from last CSV uploads</span>
      </div>

      <div
        className="charts-3-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "1rem",
          height: "400px", // height of left chart, right two stack to same height
        }}
      >
        {/* Left big chart */}
        <div
          className="chart-left"
          style={{
            gridRow: "1 / span 2",
            background: "#f0f0f0",
            borderRadius: "8px",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            fontStyle: "italic",
            color: "#888",
          }}
        >
          {displayDatasets[0].id ? `Big Chart: ${displayDatasets[0].name}` : "No dataset"}
        </div>

        {/* Right top small chart */}
        <div
          className="chart-right-top"
          style={{
            background: "#f8f8f8",
            borderRadius: "8px",
            padding: "0.5rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontStyle: "italic",
            color: "#888",
          }}
        >
          {displayDatasets[1].id ? `Small Chart: ${displayDatasets[1].name}` : "No dataset"}
        </div>

        {/* Right bottom small chart */}
        <div
          className="chart-right-bottom"
          style={{
            background: "#f8f8f8",
            borderRadius: "8px",
            padding: "0.5rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontStyle: "italic",
            color: "#888",
          }}
        >
          {displayDatasets[2].id ? `Small Chart: ${displayDatasets[2].name}` : "No dataset"}
        </div>
      </div>

      {/* Buttons for big chart */}


      {datasets.length === 0 && (
        <p style={{ textAlign: "center", fontStyle: "italic", marginTop: "1rem" }}>
          No datasets uploaded yet
        </p>
      )}
    </div>
  );
}
