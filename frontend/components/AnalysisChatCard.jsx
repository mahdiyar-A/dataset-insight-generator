"use client";

import { useState } from "react";

export default function AnalysisAssistantCard() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!message.trim() || sending) return;

    setSending(true);

    await fetch("/api/assistant/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    setMessage("");
    setSending(false);
  };

  return (
    <div className="card analysis-chat-card">
      <div className="card-header">
        <h2>Analysis assistant</h2>
        <div className="header-actions">
          <span className="pill live-pill">
            Step 2 of 4 · Profiling & cleaning
          </span>
          <a href="/dashboard/assistant" className="open-aa">
            Open →
          </a>
        </div>
      </div>

      <div className="analysis-timeline">
        <span className="step done">1. Upload</span>
        <span className="step active">2. Data quality checks</span>
        <span className="step">3. Insights</span>
        <span className="step">4. Report ready</span>
      </div>

      <div className="analysis-chat-log">
        <div className="msg-row assistant">
          <div className="msg">
            We’ve scanned your dataset and detected data quality issues.
            Ask a question here, or open the full assistant for deeper analysis.
          </div>
        </div>
      </div>

      <div className="analysis-input-row">
        <input
          type="text"
          placeholder="Ask a question…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          disabled={sending}
        />
        <button
          className="send-btn"
          onClick={sendMessage}
          disabled={sending}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
