"use client";

import "./assistant.css";


export default function AssistantPage() {
  return (
    <div className="assistant-root">
      {/* SIDEBAR */}
      <div className="left-rail">
        <div className="app-logo">
          <img src="/DIG.png" alt="Data Insight Generator logo" />
        </div>

        <div className="sidebar">
          <a href="/dashboard" className="sidebar-dashboard-btn">
            ← Back to Dashboard
          </a>

          <h2>Your CSVs</h2>

          <div className="file-list">
            <div className="file-item active">sales_data.csv</div>
            <div className="file-item">inventory.csv</div>
            <div className="file-item">customers.csv</div>
            <div className="file-item">marketing.csv</div>
            <div className="file-item">employees.csv</div>
            <div className="file-item">expenses.csv</div>
            <div className="file-item">profits.csv</div>
            <div className="file-item">shipments.csv</div>
          </div>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div className="chat-column">
        <div className="chat-wrapper">

          <div className="aa-sticky-title">
            <strong>Data Insight Generator</strong>
            <span> | Analysis Assistant</span>
          </div>

          <div className="status-bar">
            <span>
              File: <strong>sales_data.csv</strong>
            </span>
            <span>Rows: 1024 · Columns: 8 · Missing: 42%</span>
          </div>

          <div className="chat-container">
            <div className="msg-row assistant">
              <div className="msg">Dataset loaded successfully.</div>
            </div>
            <div className="msg-row user">
              <div className="msg">Can you fix that automatically?</div>
            </div>
            <div className="msg-row assistant">
              <div className="msg">Yes. Median imputation recommended.</div>
            </div>
          </div>

          <div className="input-row">
            <div className="input-row-inner">
              <input type="text" placeholder="Ask a question…" />
              <button className="send-btn">Send</button>
            </div>

            <button className="download-btn">
              Download Cleaned Dataset
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
