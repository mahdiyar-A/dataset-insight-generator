"use client";

import React, { useState, useEffect } from "react";

export default function DownloadCard() {
  const [datasets, setDatasets] = useState([]);

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
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

  const hasData = datasets.length > 0;

  const handleDownloadPDF = () => {
    if (!hasData) return;
    alert("Download PDF report (mock)");
  };

  const handleDownloadCSV = () => {
    if (!hasData) return;
    alert("Download cleaned CSV (mock)");
  };

  const handleViewOnline = () => {
    if (!hasData) return;
    alert("View report online (mock)");
  };

  const handleEmailReport = () => {
    if (!hasData) return;
    alert("Email report (mock)");
  };

  return (
    <div className="card analysis-report-card">
      <div className="card-header">
        <h2>Report & exports</h2>
        <span className="pill">Report status: {hasData ? "Ready" : "Not started"}</span>
      </div>

      <p className="muted-small">
        {hasData
          ? "Once analysis is complete, you can download the PDF report or other exports."
          : "No datasets uploaded yet."}
      </p>

      <button
        className="primary-btn-lg"
        onClick={handleDownloadPDF}
        disabled={!hasData}
        style={{ opacity: hasData ? 1 : 0.5 }}
      >
        Download PDF report
      </button>

      <div className="export-buttons" style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
        <button
          className="secondary-btn"
          onClick={handleDownloadCSV}
          disabled={!hasData}
          style={{ opacity: hasData ? 1 : 0.5 }}
        >
          Download cleaned CSV
        </button>
        <button
          className="secondary-btn"
          onClick={handleViewOnline}
          disabled={!hasData}
          style={{ opacity: hasData ? 1 : 0.5 }}
        >
          View report online
        </button>
        <button
          className="secondary-btn"
          onClick={handleEmailReport}
          disabled={!hasData}
          style={{ opacity: hasData ? 1 : 0.5 }}
        >
          Email me the report
        </button>
      </div>

      <div className="report-preview" style={{ marginTop: "1rem" }}>
        <h3>What your report includes (mock)</h3>
        <ul>
          <li>Dataset overview</li>
          <li>Missing values summary</li>
          <li>Key distributions</li>
          <li>Cleaning log</li>
          <li>AI insights</li>
        </ul>
      </div>
    </div>
  );
}
