// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useTranslations } from "next-intl";
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

const STUB_FLOW = [
  { condition: "not_clean",    requiresResponse: true  },
  { condition: "low_accuracy", requiresResponse: true  },
  { condition: "all_good",     requiresResponse: false },
];

export default function AnalysisAssistantCard({ dataset, reportReady, onViewReport, onAnalysisStarted, guestMode = false }) {
  const { token } = useAuth();
  const t = useTranslations("analysis");

  const STAGES = [
    { key: "upload",   label: t("stageUpload")   },
    { key: "analysis", label: t("stageAnalysis") },
    { key: "ready",    label: t("stageReady")    },
  ];

  const getConditionMsg = (cond) => ({
    not_clean:    t("conditionNotClean"),
    low_accuracy: t("conditionLowAccuracyMsg"),
    not_workable: t("conditionNotWorkableMsg"),
    all_good:     t("conditionAllGoodMsg"),
  }[cond] ?? "");

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
      addMsg("assistant", t("reportReadyMsg"));
    }
  }, [reportReady]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const addMsg = (role, text) =>
    setMessages(prev => [...prev, { role, text }]);

  // ── Send a message to the backend chatbot ──
  const sendMessage = async (message, pendingCondition = null) => {
    if (sending) return;
    setSending(true);
    try {
      const meta = {
        fileName:         dataset?.fileName,
        fileSizeBytes:    dataset?.fileSizeBytes,
        rowCount:         dataset?.rowCount,
        columnCount:      dataset?.columnCount,
        pendingCondition: pendingCondition,
      };

      let res;
      if (guestMode) {
        const sessionId = sessionStorage.getItem("dig_guest_session") ?? "guest";
        const response  = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/guest/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId, ...meta }),
        });
        res = await response.json();
      } else {
        res = await BackendAPI.sendChatMessage(token, message, meta);
      }
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
        // If backend set status=processing (user said yes/no and analysis kicked off)
        if (!needsResp && !done && !failed && cond === null) {
          onAnalysisStarted?.();
        }
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

  const handleStubFlow = (message) => {
    if (message === "start_analysis") {
      const step = STUB_FLOW[0];
      addMsg("assistant", getConditionMsg(step.condition));
      setCondition(step.condition);
      setAwaitingResponse(step.requiresResponse);
      setStubStep(1);
      return;
    }

    if (message === "yes" || message === "no") {
      const next = STUB_FLOW[stubStep];
      if (!next) {
        // Done
        addMsg("assistant", t("analysisCompleteMsg"));
        setStage(2);
        setAwaitingResponse(false);
        return;
      }
      addMsg("assistant", getConditionMsg(next.condition));
      setCondition(next.condition);
      setAwaitingResponse(next.requiresResponse);
      setStubStep(s => s + 1);

      // If all_good → auto-advance
      if (next.condition === "all_good") {
        setAwaitingResponse(false);
        onAnalysisStarted?.();
        timerRef.current = setTimeout(() => {
          addMsg("assistant", t("analysisCompleteMsg"));
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
    const name = dataset?.fileName ?? "your dataset";
    addMsg("assistant", t("receivedFile", { fileName: name }));
    timerRef.current = setTimeout(() => sendMessage("start_analysis"), 800);
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
    sendMessage("yes", condition);
  };

  const handleNo = () => {
    if (!awaitingResponse || sending) return;
    addMsg("user", "No");
    setAwaitingResponse(false);
    sendMessage("no", condition);
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
        <h2>{t("title")}</h2>
        {stage === 0 && <span className="pill">{t("pillReady")}</span>}
        {stage === 1 && conditionStyle ? (
          <span className={`pill ${
            condition === "all_good" ? "badge-success" :
            condition === "not_clean" ? "badge-warning" :
            "badge-danger"
          }`}>
            { condition === "not_clean"    && t("conditionNeedsClean")   }
            { condition === "low_accuracy" && t("conditionLowAccuracy")  }
            { condition === "not_workable" && t("conditionNotWorkable")  }
            { condition === "all_good"     && t("conditionAllGood")      }
          </span>
        ) : stage === 1 ? (
          <span className="pill live-pill">{t("pillRunning")}</span>
        ) : null}
        {stage === 2 && (
          <span className="pill badge-success">{t("pillComplete")}</span>
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
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", padding:"28px 20px", border:"1px dashed var(--border)", borderRadius:"14px", background:"radial-gradient(circle at top, var(--accent-soft), transparent)", textAlign:"center" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background:"var(--accent-soft)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <p style={{ margin:0, fontSize:"0.9rem", fontWeight:600, color:"var(--text)" }}>{t("readyTitle")}</p>
          <p className="muted-small" style={{ maxWidth:"260px", lineHeight:"1.6" }}>
            {dataset ? t("readyDescDataset") : t("readyDescNoDataset")}
          </p>
          <button className="primary-btn" style={{ fontWeight:800, marginTop:"4px", display:"flex", alignItems:"center", gap:"7px", opacity: dataset ? 1 : 0.4, cursor: dataset ? "pointer" : "not-allowed" }} onClick={dataset ? handleStart : undefined} disabled={!dataset}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {t("startBtn")}
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
              {t("cancelBtn")}
            </button>

            {awaitingResponse && !sending && (
              <>
                <button className="chip-btn chip-no" onClick={handleNo}
                  style={{ fontSize:"0.8rem", padding:"6px 16px" }}>
                  {t("noBtn")}
                </button>
                <button className="chip-btn chip-yes" onClick={handleYes}
                  style={{ fontSize:"0.8rem", padding:"6px 16px" }}>
                  {t("yesBtn")}
                </button>
              </>
            )}
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
            {t("goToReport")}
          </button>
        </>
      )}

    </div>
  );
}