"use client";

import React, { useState, useEffect } from "react";

export default function HistoryCard() {
  const [datasets, setDatasets] = useState([]);

  // Fetch prior CSV uploads when the component mounts
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/datasets/history");
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setDatasets(data);
    } catch (err) {
      console.error(err);
      setDatasets([]);
    }
  };

  const handleView = (id) => {
    alert(id ? `View dataset ${id} (mock)` : "No dataset to view");
  };

  const handleDelete = (id) => {
    alert(id ? `Delete dataset ${id} (mock)` : "No dataset to delete");
  };

  const handleRunModel = (id) => {
    alert(id ? `Run model for dataset ${id} (mock)` : "No dataset to run model");
  };

  const emptyDataset = {
    id: null,
    name: "No Dataset added",
    rows: "—",
    columns: "—",
    uploadTime: "—",
    size: "—",
    status: "idle",
  };

  const displayDatasets = datasets.length > 0 ? datasets : [emptyDataset];

  return (
    <div className="card table-card">
      <div className="card-header">
        <h2>Dataset History</h2>
        <span className="pill">Your prior CSV uploads</span>
      </div>

      <table className="dataset-table">
        <thead>
          <tr>
            <th>Dataset name</th>
            <th>Rows</th>
            <th>Columns</th>
            <th>Upload time</th>
            <th>Size</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {displayDatasets.map((dataset, index) => (
            <tr key={index}>
              <td>{dataset.name}</td>
              <td>{dataset.rows}</td>
              <td>{dataset.columns}</td>
              <td>{dataset.uploadTime}</td>
              <td>{dataset.size}</td>
              <td>
                <span className={`status-pill ${dataset.status}`}>
                  {dataset.status === "idle" ? "Pending" : dataset.status}
                </span>
              </td>
              <td className="actions-cell">
                <button
                  className="table-action view"
                  onClick={() => handleView(dataset.id)}
                  disabled={!dataset.id}
                  style={{ opacity: dataset.id ? 1 : 0.5, cursor: dataset.id ? "pointer" : "not-allowed" }}
                >
                  View
                </button>
                <button
                  className="table-action delete"
                  onClick={() => handleDelete(dataset.id)}
                  disabled={!dataset.id}
                  style={{ opacity: dataset.id ? 1 : 0.5, cursor: dataset.id ? "pointer" : "not-allowed" }}
                >
                  Delete
                </button>
                <button
                  className="table-action run"
                  onClick={() => handleRunModel(dataset.id)}
                  disabled={!dataset.id}
                  style={{ opacity: dataset.id ? 1 : 0.5, cursor: dataset.id ? "pointer" : "not-allowed" }}
                >
                  Run model
                </button>
              </td>
            </tr>
          ))}

          
        </tbody>
      </table>
    </div>
  );
}
