// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { useSettings } from "@/app/contexts/SettingsContext";
import ChatCustomizationPanel from "@/components/ChatCustomizationPanel";
import AnalysisQA from "@/components/AnalysisQA";

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

const T = {
  en: {
    title: "Analysis Assistant",
    pills: { ready: "Ready", running: "Running…", complete: "Complete",
             notClean: "⚠ Needs cleaning", lowAcc: "⚠ Low accuracy",
             notWork: "✕ Not workable", allGood: "✓ All good" },
    stages: ["Upload", "Analysis", "Report Ready"],
    idleTitle: "Ready to analyse",
    idleDesc: (fileName) => fileName
      ? <>Press <strong style={{ color:"var(--cobalt-accent)" }}>Start</strong> to begin the analysis pipeline.</>
      : "Upload a data file above first, then start the analysis.",
    start: "Start",
    cancel: "Cancel",
    yes: "Yes",
    no: "No",
    goReport: "Go to Report",
    received: (name) => `We've received "${name}" — starting analysis now. Please wait…`,
    readAs: (what) => `This looks like: ${what}.`,
    ownWords: "Or say what it is, in your own words",
    send: "Send",
    skip: "Skip",
    skipped: "Skip this",
  },
  fr: {
    title: "Assistant d'analyse",
    pills: { ready: "Prêt", running: "En cours…", complete: "Terminé",
             notClean: "⚠ Nettoyage requis", lowAcc: "⚠ Faible précision",
             notWork: "✕ Non exploitable", allGood: "✓ Tout bon" },
    stages: ["Import", "Analyse", "Rapport prêt"],
    idleTitle: "Prêt à analyser",
    idleDesc: (fileName) => fileName
      ? <>Appuyez sur <strong style={{ color:"var(--cobalt-accent)" }}>Démarrer</strong> pour lancer l&apos;analyse.</>
      : "Importez d'abord un fichier de données, puis démarrez l'analyse.",
    start: "Démarrer",
    cancel: "Annuler",
    yes: "Oui",
    no: "Non",
    goReport: "Voir le rapport",
    received: (name) => `Nous avons reçu « ${name} » — analyse en cours. Veuillez patienter…`,
    readAs: (what) => `Cela ressemble à : ${what}.`,
    ownWords: "Ou dites ce que c'est, avec vos propres mots",
    send: "Envoyer",
    skip: "Passer",
    skipped: "Passer cette question",
  },
  fa: {
    title: "دستیار تحلیل",
    pills: { ready: "آماده", running: "در حال اجرا…", complete: "تکمیل شد",
             notClean: "⚠ نیاز به پاکسازی", lowAcc: "⚠ دقت پایین",
             notWork: "✕ قابل پردازش نیست", allGood: "✓ همه چیز خوب است" },
    stages: ["آپلود", "تحلیل", "گزارش آماده"],
    idleTitle: "آماده برای تحلیل",
    idleDesc: (fileName) => fileName
      ? <><strong style={{ color:"var(--cobalt-accent)" }}>شروع</strong> را فشار دهید تا تحلیل آغاز شود.</>
      : "ابتدا یک فایل داده آپلود کنید، سپس تحلیل را شروع کنید.",
    start: "شروع",
    cancel: "لغو",
    yes: "بله",
    no: "خیر",
    goReport: "مشاهده گزارش",
    received: (name) => `فایل "${name}" دریافت شد — تحلیل در حال شروع است. لطفاً صبر کنید…`,
    readAs: (what) => `به نظر می‌رسد این داده‌ها چنین باشد: ${what}.`,
    ownWords: "یا با کلمات خودتان بگویید چیست",
    send: "ارسال",
    skip: "رد شدن",
    skipped: "از این پرسش می‌گذرم",
  },
};

/**
 * @param {{
 *   dataset?: import("@/lib/types").Analysis | import("@/lib/types").UploadedFileMeta | null,
 *   reportReady?: boolean,
 *   onViewReport?: () => void,
 *   onAnalysisStarted?: (analysisId: string) => void,
 *   plan?: string,
 *   settings?: object | null,
 *   onSettingsChange?: (settings: object) => void,
 * }} props
 *
 * settings live in the dashboard, not here: this card remounts on every upload,
 * and a brief written before the file went in has to survive that.
 */
export default function AnalysisAssistantCard({
  dataset, reportReady, onViewReport, onAnalysisStarted,
  plan = "free",
  settings = null, onSettingsChange,
}) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;

  const isPro = plan === "pro" || plan === "admin";

  const [stage,            setStage]            = useState(0);
  const [messages,         setMessages]         = useState([]);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [sending,          setSending]          = useState(false);
  const [condition,        setCondition]        = useState(null);
  const [sessionId,        setSessionId]        = useState(null);
  // Once a run starts on the server this page cannot stop it. Cancel used to
  // stay and only clear the chat, while the run went on and used up the allowance.
  const [runStarted,       setRunStarted]       = useState(false);
  // "What is this data about?", asked when the server is not sure. Holds the
  // readings to choose from while the question is open; null otherwise.
  const [domainAsk,        setDomainAsk]        = useState(null);
  const [domainDraft,      setDomainDraft]      = useState("");

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
  const sendMessage = async (message, pendingCondition = null, extra = {}) => {
    if (sending) return;
    setSending(true);
    try {
      const meta = {
        fileName:         dataset?.fileName,
        fileSizeBytes:    dataset?.fileSizeBytes,
        rowCount:         dataset?.rowCount,
        columnCount:      dataset?.columnCount,
        pendingCondition: pendingCondition,
        analysisId:       dataset?.id ?? null,
        // Pro users: attach their report customization options
        customization:    isPro ? settings : null,
        ...extra,
      };

      const res       = await BackendAPI.sendChatMessage(token, message, meta);
      const reply     = res?.reply ?? res?.content ?? "Processing…";
      const cond      = res?.condition ?? null;
      const done      = res?.done      ?? false;
      const failed    = res?.failed    ?? false;
      const needsResp = res?.requiresResponse ?? false;
      // The server is not sure what the data is and asks, before anything runs.
      const askingDomain = res?.ask === "domain" && !failed;

      // When the server was sure, it says what it read, so the person can see
      // what the report will rest on.
      if (res?.understoodAs) addMsg("assistant", t.readAs(res.understoodAs));
      addMsg("assistant", reply);
      setCondition(cond);
      setDomainAsk(askingDomain ? { options: Array.isArray(res.options) ? res.options : [] } : null);
      if (askingDomain) {
        setDomainDraft("");
        setAwaitingResponse(false);   // this question has its own answers, not Yes and No
        return;
      }

      if (failed) {
        // Stay at stage 1 so the error message stays visible in the chat log.
        // The chatbot resets automatically when the user uploads a new file.
        setAwaitingResponse(false);
      } else if (done) {
        setStage(2);
        setAwaitingResponse(false);
      } else {
        // Only trigger polling when analysis actually kicks off:
        // - message was "yes"/"no" (user confirmed)
        // - OR message was "start_analysis" and condition is "all_good" (no confirmation needed)
        // - OR the same once "what is this data about?" has been answered
        const analysisKickingOff = !needsResp && !done && !failed &&
          (message === "yes" || message === "no" ||
           ((message === "start_analysis" || message === "domain_answer") && cond === "all_good"));
        if (analysisKickingOff) {
          // Pass back the analysis ID so the dashboard can start polling for it
          const newAnalysisId = res?.analysisId || dataset?.id || null;
          setRunStarted(true);
          onAnalysisStarted?.(newAnalysisId);
        }
        setAwaitingResponse(needsResp);
      }
    } catch {
      // Show the error in the chat, which stays visible. The stub flow is for development only.
      if (process.env.NODE_ENV === "development") {
        handleStubFlow(message);
      } else {
        addMsg("assistant", "⚠️ Could not reach the analysis service. Please try uploading your file again.");
        setAwaitingResponse(false);
      }
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
        onAnalysisStarted?.();
        timerRef.current = setTimeout(() => {
          addMsg("assistant", "✅ Analysis complete! Your report is being generated.");
          setStage(2);
        }, 1200);
      }
    }
  };

  // The answer to "what is this data about?". `confirmed` is true for the
  // server's own reading, which tells the analysis nothing new; an empty
  // answer is a skip, and the analysis goes ahead on what the server had.
  const answerDomain = (text, confirmed = false) => {
    if (!domainAsk || sending) return;
    const answer = (text ?? "").trim();
    addMsg("user", answer || t.skipped);
    setDomainAsk(null);
    setDomainDraft("");
    sendMessage("domain_answer", condition, { domainAnswer: answer, domainConfirmed: confirmed });
  };

  const handleStart = () => {
    clearTimeout(timerRef.current);
    setRunStarted(false);
    setStage(1);
    setMessages([]);
    setAwaitingResponse(false);
    setCondition(null);
    setDomainAsk(null);
    setStubStep(0);
    const name = dataset?.fileName ?? "your dataset";
    addMsg("assistant", t.received(name));
    timerRef.current = setTimeout(() => sendMessage("start_analysis"), 800);
  };

  const handleCancel = () => {
    clearTimeout(timerRef.current);
    setRunStarted(false);
    setStage(0);
    setMessages([]);
    setAwaitingResponse(false);
    setCondition(null);
    setDomainAsk(null);
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
    not_clean:    { color: "var(--warn-text)", bg: "color-mix(in srgb, var(--warn) 20%, transparent)",   border: "color-mix(in srgb, var(--warn) 35%, transparent)"   },
    low_accuracy: { color: "var(--danger-text)", bg: "color-mix(in srgb, var(--danger) 15%, transparent)",  border: "color-mix(in srgb, var(--danger) 35%, transparent)" },
    not_workable: { color: "var(--danger-text)", bg: "color-mix(in srgb, var(--danger) 20%, transparent)",   border: "color-mix(in srgb, var(--danger) 40%, transparent)" },
    all_good:     { color: "var(--ok-text)", bg: "color-mix(in srgb, var(--ok) 10%, transparent)",   border: "color-mix(in srgb, var(--ok) 35%, transparent)"  },
  }[condition] ?? null;

  return (
    <div className="card analysis-chat-card">

      {/* Header */}
      <div className="card-header">
        <h2>{t.title}</h2>
        {stage === 0 && <span className="pill">{t.pills.ready}</span>}
        {stage === 1 && conditionStyle ? (
          <span className="pill" style={{ borderColor: conditionStyle.border, color: conditionStyle.color, background: conditionStyle.bg }}>
            { condition === "not_clean"    && t.pills.notClean    }
            { condition === "low_accuracy" && t.pills.lowAcc      }
            { condition === "not_workable" && t.pills.notWork     }
            { condition === "all_good"     && t.pills.allGood     }
          </span>
        ) : stage === 1 ? (
          <span className="pill live-pill">{t.pills.running}</span>
        ) : null}
        {stage === 2 && (
          <span className="pill" style={{ borderColor:"var(--ok-text)", color:"var(--ok-text)", background:"color-mix(in srgb, var(--ok) 10%, transparent)" }}>
            {t.pills.complete}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="analysis-timeline">
        {t.stages.map((label, i) => {
          const isDone   = i < stage;
          const isActive = i === stage;
          const key      = ["upload","analysis","ready"][i];
          return (
            <span key={key} className={`step${isDone ? " done" : isActive ? " active" : ""}`}>
              {isDone ? "✓ " : ""}{label}
            </span>
          );
        })}
      </div>

      {/* ── STAGE 0: idle ── */}
      {stage === 0 && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", padding:"28px 20px", border:"1px dashed var(--line)", borderRadius:"0", background:"radial-gradient(circle at top, color-mix(in srgb, var(--cobalt) 6%, transparent), transparent)", textAlign:"center" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background:"color-mix(in srgb, var(--cobalt) 12%, transparent)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.6">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <p style={{ margin:0, fontSize:"0.9rem", fontWeight:600, color:"var(--ink)" }}>{t.idleTitle}</p>
          <p className="muted-small" style={{ maxWidth:"260px", lineHeight:"1.6" }}>
            {t.idleDesc(dataset?.fileName)}
          </p>
          <button className="primary-btn" style={{ fontWeight:800, marginTop:"4px", display:"flex", alignItems:"center", gap:"7px", opacity: dataset ? 1 : 0.4, cursor: dataset ? "pointer" : "not-allowed" }} onClick={dataset ? handleStart : undefined} disabled={!dataset}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {t.start}
          </button>

          {/* Pro customization panel — shown in idle state before analysis starts */}
          <ChatCustomizationPanel
            isPro={isPro}
            value={settings}
            onChange={onSettingsChange}
            onUpgrade={() => { if (typeof window !== "undefined") window.location.href = "/plans"; }}
          />
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

          {/* "What is this data about?" — the server's readings to pick from,
              a box for the person's own words, and a way past the question. */}
          {domainAsk && !sending && (
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              {domainAsk.options.length > 0 && (
                <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                  {domainAsk.options.map((option, i) => (
                    <button key={option} type="button" className="chip-btn subtle"
                      onClick={() => answerDomain(option, i === 0)}
                      style={{ fontSize:"0.78rem", padding:"6px 12px", textAlign:"start",
                        borderColor:"color-mix(in srgb, var(--cobalt) 45%, transparent)", color:"var(--cobalt-accent)", background:"color-mix(in srgb, var(--cobalt) 12%, transparent)" }}>
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); if (domainDraft.trim()) answerDomain(domainDraft); }}
                style={{ display:"flex", gap:"8px" }}>
                <input
                  type="text"
                  dir={domainDraft ? "auto" : undefined}
                  aria-label={t.ownWords}
                  placeholder={t.ownWords}
                  value={domainDraft}
                  maxLength={300}
                  onChange={(e) => setDomainDraft(e.target.value)}
                  style={{ flex:1, minWidth:0, padding:"8px 12px", borderRadius:"0", outline:"none",
                    border:"1px solid var(--line)", background:"var(--card)",
                    color:"var(--ink)", fontSize:"0.82rem" }}
                />
                <button type="submit" className="primary-btn" disabled={!domainDraft.trim()}
                  style={{ padding:"8px 16px", fontSize:"0.8rem", opacity: domainDraft.trim() ? 1 : 0.5,
                    cursor: domainDraft.trim() ? "pointer" : "not-allowed" }}>
                  {t.send}
                </button>
              </form>
            </div>
          )}

          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
            {domainAsk && !sending && (
              <button type="button" className="chip-btn subtle" onClick={() => answerDomain("")}
                style={{ fontSize:"0.8rem", padding:"6px 14px" }}>
                {t.skip}
              </button>
            )}
            {!runStarted && !sending && (
              <button className="chip-btn subtle" onClick={handleCancel} style={{ fontSize:"0.8rem", padding:"6px 14px" }}>
                {t.cancel}
              </button>
            )}

            {awaitingResponse && !sending && (
              <>
                <button className="chip-btn subtle" onClick={handleNo}
                  style={{ fontSize:"0.8rem", padding:"6px 16px", borderColor:"color-mix(in srgb, var(--danger) 40%, transparent)", color:"var(--danger-text)", background:"color-mix(in srgb, var(--danger) 15%, transparent)" }}>
                  {t.no}
                </button>
                <button className="chip-btn subtle" onClick={handleYes}
                  style={{ fontSize:"0.8rem", padding:"6px 16px", borderColor:"color-mix(in srgb, var(--ok) 40%, transparent)", color:"var(--ok-text)", background:"color-mix(in srgb, var(--ok) 12%, transparent)" }}>
                  {t.yes}
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
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", background:"var(--cobalt)" }}
            onClick={onViewReport}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            {t.goReport}
          </button>

          {dataset?.id && <AnalysisQA analysisId={dataset.id} plan={plan} />}
        </>
      )}

    </div>
  );
}