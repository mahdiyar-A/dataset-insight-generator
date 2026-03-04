// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect } from "react";

/*
  3 stages:
  0 → "upload"   — idle, shows Start button only
  1 → "analysis" — running (analysis + insights combined)
  2 → "ready"    — report ready, shows Go to Report
*/

const STAGES = [
  { key: "upload",   label: "Upload"        },
  { key: "analysis", label: "Analysis"      },
  { key: "ready",    label: "Report Ready"  },
];

// Scripted flow — requiresResponse means Yes/No buttons appear
const FLOW = [
  { text: "Analysis started. Scanning your dataset for issues…",                       requiresResponse: false },
  { text: "Found formatting inconsistencies in 3 columns. Should I normalise them?",   requiresResponse: true  },
  { text: "Running statistical profiling across all columns…",                         requiresResponse: false },
  { text: "Detected 2 potential outlier clusters. Should I flag them in the report?",  requiresResponse: true  },
  { text: "Generating AI-powered insights and building your report…",                  requiresResponse: false },
];

export default function AnalysisAssistantCard() {
  const [stage, setStage]                       = useState(0);
  const [messages, setMessages]                 = useState([]);
  const [flowStep, setFlowStep]                 = useState(0);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const bottomRef = useRef(null);
  const timerRef  = useRef(null);

  // Only scroll inside the chat box — never touches page scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const addMsg = (role, text) =>
    setMessages((prev) => [...prev, { role, text }]);

  const advanceFlow = (step) => {
    if (step >= FLOW.length) {
      addMsg("assistant", "✅ All done! Your report is ready.");
      setStage(2);
      return;
    }
    const current = FLOW[step];
    addMsg("assistant", current.text);
    if (current.requiresResponse) {
      setAwaitingResponse(true);
    } else {
      setAwaitingResponse(false);
      setFlowStep(step + 1);
      timerRef.current = setTimeout(() => advanceFlow(step + 1), 1500);
    }
  };

  const handleStart = () => {
    clearTimeout(timerRef.current);
    setStage(1);
    setMessages([]);
    setFlowStep(0);
    setAwaitingResponse(false);
    timerRef.current = setTimeout(() => advanceFlow(0), 400);
  };

  const handleCancel = () => {
    clearTimeout(timerRef.current);
    setStage(0);
    setMessages([]);
    setFlowStep(0);
    setAwaitingResponse(false);
  };

  const handleYes = () => {
    if (!awaitingResponse) return;
    addMsg("user", "Yes");
    setAwaitingResponse(false);
    const next = flowStep + 1;
    setFlowStep(next);
    timerRef.current = setTimeout(() => advanceFlow(next), 600);
  };

  const handleNo = () => {
    if (!awaitingResponse) return;
    addMsg("user", "No");
    setAwaitingResponse(false);
    const next = flowStep + 1;
    setFlowStep(next);
    timerRef.current = setTimeout(() => advanceFlow(next), 600);
  };

  const scrollToReport = () => {
    document.getElementById("section-download")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="card analysis-chat-card">

      {/* Header */}
      <div className="card-header">
        <h2>Analysis Assistant</h2>
        {stage === 1 && <span className="pill live-pill">Running…</span>}
        {stage === 2 && (
          <span className="pill" style={{ borderColor: "rgba(34,197,94,0.6)", color: "#bbf7d0", background: "rgba(22,163,74,0.1)" }}>
            Complete
          </span>
        )}
      </div>

      {/* 3-stage timeline */}
      <div className="analysis-timeline">
        {STAGES.map((s, i) => {
          const isDone   = i < stage;
          const isActive = i === stage;
          return (
            <span key={s.key} className={`step${isDone ? " done" : isActive ? " active" : ""}`}>
              {isDone ? "✓ " : ""}{s.label}
            </span>
          );
        })}
      </div>

      {/* ══ STAGE 0 — idle ══ */}
      {stage === 0 && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "12px", padding: "28px 20px",
          border: "1px dashed rgba(55,65,81,0.8)", borderRadius: "14px",
          background: "radial-gradient(circle at top, rgba(37,99,235,0.06), transparent)",
          textAlign: "center",
        }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(37,99,235,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.6">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "#e5e7eb" }}>Ready to analyse</p>
          <p className="muted-small" style={{ maxWidth: "260px", lineHeight: "1.6" }}>
            Upload a CSV file above, then press <strong style={{ color: "#bfdbfe" }}>Start</strong> to begin.
          </p>
          <button
            className="primary-btn"
            style={{ fontWeight: 800, marginTop: "4px", display: "flex", alignItems: "center", gap: "7px" }}
            onClick={handleStart}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            Start
          </button>
        </div>
      )}

      {/* ══ STAGE 1 — analysis running ══ */}
      {stage === 1 && (
        <>
          <div className="analysis-chat-log">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-row ${msg.role}`}>
                <div className="msg">{msg.text}</div>
              </div>
            ))}
            {!awaitingResponse && (
              <div className="msg-row assistant pending">
                <div className="msg" style={{ letterSpacing: "0.2em", color: "var(--text-soft)" }}>· · ·</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Cancel — always visible during analysis */}
            <button className="chip-btn subtle" onClick={handleCancel} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
              Cancel
            </button>

            {/* No / Yes — only when assistant is waiting */}
            {awaitingResponse && (
              <>
                <button
                  className="chip-btn subtle"
                  onClick={handleNo}
                  style={{ fontSize: "0.8rem", padding: "6px 16px", borderColor: "rgba(249,115,115,0.4)", color: "#f97373", background: "rgba(127,29,29,0.15)" }}
                >
                  No
                </button>
                <button
                  className="chip-btn subtle"
                  onClick={handleYes}
                  style={{ fontSize: "0.8rem", padding: "6px 16px", borderColor: "rgba(34,197,94,0.4)", color: "#bbf7d0", background: "rgba(22,163,74,0.12)" }}
                >
                  Yes
                </button>
              </>
            )}

            {/* Start — bold, pushed right */}
            <button
              className="primary-btn"
              style={{ padding: "6px 16px", fontSize: "0.8rem", fontWeight: 800, borderRadius: "999px", marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}
              onClick={handleStart}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Start
            </button>
          </div>
        </>
      )}

      {/* ══ STAGE 2 — report ready ══ */}
      {stage === 2 && (
        <>
          <div className="analysis-chat-log">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-row ${msg.role}`}>
                <div className="msg">{msg.text}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Go to Report — only exists at stage 2 */}
          <button
            className="primary-btn"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, #16a34a, #15803d)",
              boxShadow: "0 8px 24px rgba(22,163,74,0.35)",
            }}
            onClick={scrollToReport}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Go to Report
          </button>
        </>
      )}

    </div>
  );
}