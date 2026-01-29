"use client";

import React, { useState, useRef } from "react";

export default function UploadCard() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [statusText, setStatusText] = useState("No file selected.");
  const [status, setStatus] = useState("idle"); // "idle" | "uploading" | "done"

  const handleUpload = async (selectedFile) => {
    setFile(selectedFile);
    setStatus("uploading");
    setStatusText("Uploading…");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setStatus("done");
      setStatusText("Upload complete.");
    } catch (err) {
      console.error(err);
      setStatus("idle");
      setStatusText("Upload failed. Try again.");
    }
  };

  return (
    <div className="card upload-card">
      <h2>Upload CSV</h2>
      <p className="muted">
        Drag and drop your .csv file here, or click to browse. Max 50 MB.
      </p>

      {/* Dropzone / click-to-upload */}
      <label className="upload-dropzone">
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) handleUpload(selectedFile);
          }}
        />
        <div className="dropzone-inner">
          <div className="dropzone-icon">⬆</div>
          <div>
            <p className="dropzone-title">Drop your file here</p>
            <p className="muted-small">or click to choose a file</p>
          </div>
        </div>
      </label>

      {/* Status bar */}
      <div className="upload-status-bar">
        <div className="status-header">
          <span>{statusText}</span>
          <span className={`status-pill ${status}`}>
            {status === "idle"
              ? "Idle"
              : status === "uploading"
              ? "Uploading"
              : "Done"}
          </span>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width:
                status === "done"
                  ? "100%"
                  : status === "uploading"
                  ? "50%"
                  : "0%",
            }}
          />
        </div>
      </div>

      {/* Quick stats */}
      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Rows detected</span>
          <span className="stat-value">–</span>
        </div>
        <div className="stat">
          <span className="stat-label">Columns</span>
          <span className="stat-value">–</span>
        </div>
        <div className="stat">
          <span className="stat-label">Missing values</span>
          <span className="stat-value">–</span>
        </div>
        <div className="stat">
          <span className="stat-label">Upload time</span>
          <span className="stat-value">–</span>
        </div>
      </div>
    </div>
  );
}
