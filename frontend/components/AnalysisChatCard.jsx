// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

/*
  4 dataset conditions returned by backend:
  - "not_clean"     → dataset has quality issues, cleaning recommended
  - "low_accuracy"  → dataset may not produce reliable insights
  - "not_workable"  → dataset cannot be processed (too sparse, wrong format, etc.)
  - "all_good"      → dataset is ready, proceed to full analysis

  Flow:
  1. User clicks Start → frontend sends POST /api/chat/message { message: "start_analysis" }
  2. Backend responds with condition + message
  3. Frontend shows message, Yes/No buttons if applicable
  4. User clicks Yes/No → POST /api/chat/message { message: "yes"|"no" }
  5. Continue until backend signals done or failed
  6. When done → show green "Go to Report" button
*/

const STAGES = [
  { key: "upload",   label: "Upload"       },
  { key: "analysis", label: "Analysis"     },
  { key: "ready",    label: "Report Ready" },
];

// Condition messages shown while chatbot is unavailable (backend not wired yet)
// These mirror what the backend will eventually return
const CONDITION_STUBS = {
  not_clean:    "Your dataset has quality issues — missing values, duplicates, or formatting inconsistencies were found. Would you like me to clean it automatically?",
  low_accuracy: "Your dataset may produce low-accuracy insights due to limited data points or high variance. Would you like to proceed anyway?",
  not_workable: "Unfortunately, your dataset cannot be processed. It may be too sparse, use an unsupported structure, or contain no usable columns.",
  all_good:     "Your dataset looks great! No significant issues found. Ready to generate your full report and visualizations.",
};

export default function AnalysisAssistantCard({ reportReady, onViewReport }) {
  const { token } = useAuth();

  const [stage,            setStage]            = useState(0);   // 0=idle 1=running 2=ready
  const [messages,         setMessages]         = useState([]);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [sending,          setSending]          = useState(false);
  const [condition,        setCondition]        = useState(null); // current condition from backend
  const [sessionId,        setSessionId]        = useState(null); // chat session from backend

  const bottomRef = useRef(null);
  const timerRef  = useRef(null);

  // Scroll chat log on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  // If parent signals report is ready (polling found it), jump to stage 2
  useEffect(() => {
    if (reportReady && stage < 2) {
      setStage(2);
      addMsg("assistant", "✅ Your report is ready! Click below to view it.");
    }
  }, [reportReady]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const addMsg = (role, text) =>
    setMessages(prev => [...prev, { role, text }]);

  // ── Send a message to the backend chatbot ──
  const sendMessage = async (message) => {
    if (sending) return;
    setSending(true);
    try {
      const res = await BackendAPI.sendChatMessage(token, message);
      // Expected: { reply, condition, done, failed, requiresResponse }
      const reply     = res?.reply ?? res?.content ?? "Processing…";
      const cond      = res?.condition ?? null;
      const done      = res?.done      ?? false;
      const failed    = res?.failed    ?? false;
      const needsResp = res?.requiresResponse ?? false;

      addMsg("assistant", reply);
      setCondition(cond);

      if (failed) {
        setStage(0);
        setAwaitingResponse(false);
      } else if (done) {
        setStage(2);
        setAwaitingResponse(false);
      } else {
        setAwaitingResponse(needsResp);
      }
    } catch (err) {
      // Backend not ready yet — use stub condition responses
      handleStubFlow(message);
    } finally {
      setSending(false);
    }
  };

  // ── Stub flow: used when backend chat API isn't wired yet ──
  // Simulates the 4 conditions so UI is testable
  const [stubStep, setStubStep] = useState(0);
  const STUB_FLOW = [
    { condition: "not_clean",    requiresResponse: true  },
    { condition: "low_accuracy", requiresResponse: true  },
    { condition: "all_good",     requiresResponse: false },
  ];

  const handleStubFlow = (message) => {
    if (message === "start_analysis") {
      const step = STUB_FLOW[0];
      addMsg("assistant", CONDITION_STUBS[step.condition]);
      setCondition(step.condition);
      setAwaitingResponse(step.requiresResponse);
      setStubStep(1);
      return;
    }

    if (message === "yes" || message === "no") {
      const next = STUB_FLOW[stubStep];
      if (!next) {
        // Done
        addMsg("assistant", "✅ Analysis complete! Your report is being generated.");
        setStage(2);
        setAwaitingResponse(false);
        return;
      }
      addMsg("assistant", CONDITION_STUBS[next.condition]);
      setCondition(next.condition);
      setAwaitingResponse(next.requiresResponse);
      setStubStep(s => s + 1);

      // If all_good → auto-advance
      if (next.condition === "all_good") {
        setAwaitingResponse(false);
        timerRef.current = setTimeout(() => {
          addMsg("assistant", "✅ Analysis complete! Your report is being generated.");
          setStage(2);
        }, 1200);
      }
    }
  };

  const handleStart = () => {
    clearTimeout(timerRef.current);
    setStage(1);
    setMessages([]);
    setAwaitingResponse(false);
    setCondition(null);
    setStubStep(0);
    addMsg("assistant", "Analysis started. Scanning your dataset…");
    timerRef.current = setTimeout(() => sendMessage("start_analysis"), 600);
  };

  const handleCancel = () => {
    clearTimeout(timerRef.current);
    setStage(0);
    setMessages([]);
    setAwaitingResponse(false);
    setCondition(null);
    setStubStep(0);
  };

  const handleYes = () => {
    if (!awaitingResponse || sending) return;
    addMsg("user", "Yes");
    setAwaitingResponse(false);
    sendMessage("yes");
  };

  const handleNo = () => {
    if (!awaitingResponse || sending) return;
    addMsg("user", "No");
    setAwaitingResponse(false);
    sendMessage("no");
  };

  // Condition badge color
  const conditionStyle = {
    not_clean:    { color: "#fbbf24", bg: "rgba(120,53,15,0.2)",   border: "rgba(180,83,9,0.3)"   },
    low_accuracy: { color: "#f97373", bg: "rgba(127,29,29,0.15)",  border: "rgba(249,115,115,0.3)" },
    not_workable: { color: "#f97373", bg: "rgba(127,29,29,0.2)",   border: "rgba(249,115,115,0.4)" },
    all_good:     { color: "#bbf7d0", bg: "rgba(22,163,74,0.1)",   border: "rgba(34,197,94,0.3)"  },
  }[condition] ?? null;

  return (
    <div className="card analysis-chat-card">

      {/* Header */}
      <div className="card-header">
        <h2>Analysis Assistant</h2>
        {stage === 0 && <span className="pill">Ready</span>}
        {stage === 1 && conditionStyle ? (
          <span className="pill" style={{ borderColor: conditionStyle.border, color: conditionStyle.color, background: conditionStyle.bg }}>
            { condition === "not_clean"    && "⚠ Needs cleaning"    }
            { condition === "low_accuracy" && "⚠ Low accuracy"      }
            { condition === "not_workable" && "✕ Not workable"       }
            { condition === "all_good"     && "✓ All good"           }
          </span>
        ) : stage === 1 ? (
          <span className="pill live-pill">Running…</span>
        ) : null}
        {stage === 2 && (
          <span className="pill" style={{ borderColor:"rgba(34,197,94,0.6)", color:"#bbf7d0", background:"rgba(22,163,74,0.1)" }}>
            Complete
          </span>
        )}
      </div>

      {/* Timeline */}
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

      {/* ── STAGE 0: idle ── */}
      {stage === 0 && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", padding:"28px 20px", border:"1px dashed rgba(55,65,81,0.8)", borderRadius:"14px", background:"radial-gradient(circle at top, rgba(37,99,235,0.06), transparent)", textAlign:"center" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background:"rgba(37,99,235,0.12)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.6">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <p style={{ margin:0, fontSize:"0.9rem", fontWeight:600, color:"#e5e7eb" }}>Ready to analyse</p>
          <p className="muted-small" style={{ maxWidth:"260px", lineHeight:"1.6" }}>
            Upload a CSV above, then press <strong style={{ color:"#bfdbfe" }}>Start</strong> to begin the analysis pipeline.
          </p>
          <button className="primary-btn" style={{ fontWeight:800, marginTop:"4px", display:"flex", alignItems:"center", gap:"7px" }} onClick={handleStart}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start
          </button>
        </div>
      )}

      {/* ── STAGE 1: running ── */}
      {stage === 1 && (
        <>
          <div className="analysis-chat-log">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-row ${msg.role}`}>
                <div className="msg">{msg.text}</div>
              </div>
            ))}
            {/* Typing indicator while waiting for backend */}
            {sending && (
              <div className="msg-row assistant pending">
                <div className="msg" style={{ letterSpacing:"0.2em", color:"var(--text-soft)" }}>· · ·</div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
            <button className="chip-btn subtle" onClick={handleCancel} style={{ fontSize:"0.8rem", padding:"6px 14px" }}>
              Cancel
            </button>

            {awaitingResponse && !sending && (
              <>
                <button className="chip-btn subtle" onClick={handleNo}
                  style={{ fontSize:"0.8rem", padding:"6px 16px", borderColor:"rgba(249,115,115,0.4)", color:"#f97373", background:"rgba(127,29,29,0.15)" }}>
                  No
                </button>
                <button className="chip-btn subtle" onClick={handleYes}
                  style={{ fontSize:"0.8rem", padding:"6px 16px", borderColor:"rgba(34,197,94,0.4)", color:"#bbf7d0", background:"rgba(22,163,74,0.12)" }}>
                  Yes
                </button>
              </>
            )}

            <button className="primary-btn" onClick={handleStart} disabled={sending}
              style={{ padding:"6px 16px", fontSize:"0.8rem", fontWeight:800, borderRadius:"999px", marginLeft:"auto", display:"flex", alignItems:"center", gap:"6px", opacity: sending ? 0.5 : 1 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Start
            </button>
          </div>
        </>
      )}

      {/* ── STAGE 2: done ── */}
      {stage === 2 && (
        <>
          <div className="analysis-chat-log">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-row ${msg.role}`}>
                <div className="msg">{msg.text}</div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          <button className="primary-btn"
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", borderRadius:"999px", background:"linear-gradient(135deg,#16a34a,#15803d)", boxShadow:"0 8px 24px rgba(22,163,74,0.35)" }}
            onClick={onViewReport}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            Go to Report
          </button>
        </>
      )}

    </div>
  );
}