// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";
import { MAX_ASK_CHARS } from "@/lib/reportSettings";

/*
  Questions about a finished analysis.

  The conversation lives here, in the browser, and the earlier turns go with
  each question. Nothing about it is stored on the server, which is why it ends
  when the user loads another analysis.

  What the assistant may say is bounded by the AI service. The daily allowance
  is the backend's. This component's job is to be honest about both: a figure
  that could not be checked is shown as such, and a question we failed to
  answer goes back in the box and costs nothing.
*/

const T = {
  en: {
    title: "Ask about this analysis",
    hint: "Answers come from your data and this report. The conversation isn't saved.",
    placeholder: "e.g. Which region grew the fastest?",
    send: "Ask",
    suggestions: [
      "What is the most important finding?",
      "How far can I trust these results?",
      "What should I look at next?",
    ],
    left: (n) => (n === 1 ? "1 question left today" : `${n} questions left today`),
    fromData: "Worked out from your data",
    unverified: (list) => `Check these figures: ${list}. They couldn't be matched to your data.`,
    limitFree: "You've used today's questions. They reset at midnight UTC, or upgrade to Pro for more.",
    limitPro: "You've used today's questions. They reset at midnight UTC.",
    noContext: "This analysis was made before questions were available. Run it again to ask about it.",
    notReady: "Questions open once the analysis has finished.",
    unreachable: "The assistant couldn't be reached just now. Your question wasn't counted, so please try again in a minute.",
  },
  fr: {
    title: "Posez une question sur cette analyse",
    hint: "Les réponses viennent de vos données et de ce rapport. La conversation n'est pas enregistrée.",
    placeholder: "ex. Quelle région a le plus progressé ?",
    send: "Demander",
    suggestions: [
      "Quel est le résultat le plus important ?",
      "Quelle confiance accorder à ces résultats ?",
      "Que devrais-je examiner ensuite ?",
    ],
    left: (n) => (n === 1 ? "1 question restante aujourd'hui" : `${n} questions restantes aujourd'hui`),
    fromData: "Calculé à partir de vos données",
    unverified: (list) => `Vérifiez ces chiffres : ${list}. Ils n'ont pas pu être rapprochés de vos données.`,
    limitFree: "Vous avez utilisé vos questions du jour. Elles reviennent à minuit UTC, ou passez à Pro pour en avoir plus.",
    limitPro: "Vous avez utilisé vos questions du jour. Elles reviennent à minuit UTC.",
    noContext: "Cette analyse date d'avant les questions. Relancez-la pour poser des questions.",
    notReady: "Les questions s'ouvrent une fois l'analyse terminée.",
    unreachable: "L'assistant est injoignable pour le moment. Votre question n'a pas été comptée : réessayez dans une minute.",
  },
  fa: {
    title: "درباره این تحلیل بپرسید",
    hint: "پاسخ‌ها از داده‌های شما و همین گزارش می‌آیند. این گفتگو ذخیره نمی‌شود.",
    placeholder: "مثلاً کدام منطقه سریع‌تر رشد کرد؟",
    send: "بپرس",
    suggestions: [
      "مهم‌ترین یافته چیست؟",
      "چقدر می‌توانم به این نتایج اعتماد کنم؟",
      "بعد از این باید چه چیزی را بررسی کنم؟",
    ],
    left: (n) => `${n} پرسش تا پایان امروز باقی مانده`,
    fromData: "از روی داده‌های شما محاسبه شد",
    unverified: (list) => `این اعداد را بررسی کنید: ${list}. با داده‌های شما تطبیق داده نشدند.`,
    limitFree: "پرسش‌های امروز شما تمام شده. نیمه‌شب UTC دوباره فعال می‌شوند، یا برای پرسش بیشتر به Pro ارتقا دهید.",
    limitPro: "پرسش‌های امروز شما تمام شده. نیمه‌شب UTC دوباره فعال می‌شوند.",
    noContext: "این تحلیل پیش از اضافه شدن پرسش و پاسخ انجام شده. برای پرسیدن، آن را دوباره اجرا کنید.",
    notReady: "پرسش‌ها پس از پایان تحلیل فعال می‌شوند.",
    unreachable: "الان به دستیار دسترسی نیست. پرسش شما شمرده نشد؛ لطفاً یک دقیقه دیگر دوباره تلاش کنید.",
  },
};

/** Failures after which asking again today cannot help. */
function closedMessage(code, t, isPro) {
  if (code === "CHAT_LIMIT")      return isPro ? t.limitPro : t.limitFree;
  if (code === "NO_CHAT_CONTEXT") return t.noContext;
  if (code === "NOT_READY")       return t.notReady;
  return null;
}

/**
 * @param {{ analysisId: string, plan?: string }} props
 */
export default function AnalysisQA({ analysisId, plan = "free" }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;
  const isPro = plan === "pro" || plan === "admin";

  const [turns,     setTurns]     = useState([]);
  const [draft,     setDraft]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [notice,    setNotice]    = useState("");
  const [closed,    setClosed]    = useState("");

  const logRef = useRef(null);

  // Scroll the log itself: scrollIntoView would drag the whole page along.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [turns, sending]);

  const ask = async (text) => {
    const question = text.trim();
    if (!question || sending || closed) return;

    const history = turns.map((turn) => ({ role: turn.role, content: turn.text }));
    setTurns((prev) => [...prev, { role: "user", text: question }]);
    setDraft("");
    setNotice("");
    setSending(true);

    // The question goes back in the box so trying again is one click, and it
    // leaves the log so the next question isn't sent with an unanswered turn.
    const giveBack = (message) => {
      setTurns((prev) => prev.slice(0, -1));
      setDraft(question);
      setNotice(message);
    };

    try {
      const res = await BackendAPI.chatAsk(token, analysisId, question, history, lang);
      if (typeof res.remaining === "number") setRemaining(res.remaining);
      if (res.failed) {
        giveBack(t.unreachable);
      } else {
        setTurns((prev) => [...prev, {
          role: "assistant",
          text: res.answer,
          fromData: res.grounding === "data",
          unverified: res.unverifiedNumbers ?? [],
        }]);
      }
    } catch (err) {
      const message = closedMessage(err?.code, t, isPro);
      if (message) {
        setTurns((prev) => prev.slice(0, -1));
        setClosed(message);
      } else {
        giveBack(t.unreachable);
      }
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginTop:"4px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"10px", flexWrap:"wrap" }}>
        <h3 style={{ margin:0, fontSize:"0.85rem", fontWeight:700, color:"#e5e7eb" }}>{t.title}</h3>
        {remaining !== null && !closed && (
          <span className="muted-small">{t.left(remaining)}</span>
        )}
      </div>
      <p className="muted-small" style={{ margin:0 }}>{t.hint}</p>

      {(turns.length > 0 || sending) && (
        <div className="analysis-chat-log" ref={logRef} style={{ maxHeight:"340px" }} aria-live="polite">
          {turns.map((turn, i) => (
            <div key={i} className={`msg-row ${turn.role}`}>
              <div className="msg" dir="auto" style={{ whiteSpace:"pre-wrap" }}>
                {turn.text}
                {turn.fromData && (
                  <p className="muted-small" style={{ margin:"6px 0 0" }}>{t.fromData}</p>
                )}
                {turn.unverified?.length > 0 && (
                  <p style={{ margin:"6px 0 0", fontSize:"0.72rem", color:"#fbbf24" }}>
                    ⚠ {t.unverified(turn.unverified.join(", "))}
                  </p>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="msg-row assistant pending">
              <div className="msg" style={{ letterSpacing:"0.2em", color:"var(--text-soft)" }}>· · ·</div>
            </div>
          )}
        </div>
      )}

      {closed ? (
        <p role="status" style={{ margin:0, padding:"9px 12px", borderRadius:"10px", fontSize:"0.78rem", lineHeight:1.5,
          color:"#fde68a", background:"rgba(120,53,15,0.2)", border:"1px solid rgba(180,83,9,0.3)" }}>
          {closed}
          {!isPro && closed === t.limitFree && (
            <> <a href="/plans" style={{ color:"#fbbf24", fontWeight:700 }}>Pro →</a></>
          )}
        </p>
      ) : (
        <>
          {turns.length === 0 && !sending && (
            <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
              {t.suggestions.map((s) => (
                <button key={s} type="button" className="chip-btn subtle"
                  style={{ fontSize:"0.74rem", padding:"5px 11px" }} onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} style={{ display:"flex", gap:"8px" }}>
            <input
              type="text"
              dir={draft ? "auto" : undefined}
              aria-label={t.title}
              value={draft}
              maxLength={MAX_ASK_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.placeholder}
              style={{ flex:1, minWidth:0, padding:"8px 12px", borderRadius:"8px", outline:"none",
                border:"1px solid rgba(55,65,81,0.8)", background:"rgba(15,23,42,0.9)",
                color:"#e2e8f0", fontSize:"0.82rem" }}
            />
            <button type="submit" className="primary-btn" disabled={sending || !draft.trim()}
              style={{ padding:"8px 16px", fontSize:"0.8rem", opacity:(sending || !draft.trim()) ? 0.5 : 1,
                cursor:(sending || !draft.trim()) ? "not-allowed" : "pointer" }}>
              {t.send}
            </button>
          </form>
          {notice && (
            <p role="alert" style={{ margin:0, fontSize:"0.74rem", color:"#f97373" }}>{notice}</p>
          )}
        </>
      )}
    </div>
  );
}
