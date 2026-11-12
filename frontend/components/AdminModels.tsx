"use client";

import React, { useEffect, useState } from "react";
import BackendAPI from "@/lib/BackendAPI";
import { errorMessage } from "@/lib/types";

/*
  The AI models DIG runs on, for the owner.

  Every one is a free endpoint another company runs and can withdraw without
  telling us. The server checks every six hours and emails when something is wrong;
  this shows the same check on demand, and lets the owner send a test alert,
  because an alarm nobody has heard ring is a guess.
*/

type ModelRow = {
  provider: string; model: string; name: string; usedFor: string[];
  status: "ok" | "expiring" | "missing" | "no_key" | "unknown"; expires?: string;
};
type Outcome = { total: number; failed: number };
type ModelStatus = {
  checkedAt?: string;
  models?: ModelRow[];
  chains?: { purpose: string; models: number; working: number }[];
  allowance?: { openrouter?: { used: number; limit: number; remaining: number } };
  health?: { windowHours?: number; outcomes?: Record<string, Outcome> };
  problems?: string[];
  notes?: string[];
};

const STATUS: Record<ModelRow["status"], { label: string; color: string }> = {
  ok:       { label: "Available",            color: "#86efac" },
  expiring: { label: "Being withdrawn",      color: "#fde68a" },
  missing:  { label: "Withdrawn",            color: "#fca5a5" },
  no_key:   { label: "No key on the server", color: "#fca5a5" },
  unknown:  { label: "Could not be checked", color: "#94a3b8" },
};

const PROVIDERS: Record<string, string> = { openrouter: "OpenRouter", groq: "Groq" };

// What was counted over the last day, in the words the owner would use.
const WORK: [string, string, string][] = [
  ["report",   "Reports",              "written without AI"],
  ["question", "Questions",            "left unanswered"],
  ["domain",   "Files",                "whose subject no model could name"],
  ["brief",    "Report descriptions",  "no model could read"],
];

const card: React.CSSProperties = {
  background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.8)",
  borderRadius: "14px", padding: "20px 24px", marginBottom: "16px",
};
const heading: React.CSSProperties = { margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 700, color: "#94a3b8" };

export default function AdminModels({ token }: { token: string }) {
  const [status,  setStatus]  = useState<ModelStatus | null>(null);
  const [error,   setError]   = useState("");
  const [testing, setTesting] = useState(false);
  const [tested,  setTested]  = useState<{ sent: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    BackendAPI.adminGetModels(token)
      .then((s: ModelStatus) => { if (!cancelled) setStatus(s); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [token]);

  const sendTest = async () => {
    setTesting(true); setTested(null);
    try {
      setTested(await BackendAPI.adminTestAlert(token));
    } catch (e) {
      setTested({ sent: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const problems  = status?.problems ?? [];
  const allowance = status?.allowance?.openrouter;
  const outcomes  = status?.health?.outcomes ?? {};
  const counted   = WORK.filter(([key]) => outcomes[key]?.total);

  return (
    <div>
      {error && (
        <p role="alert" style={{ ...card, color: "#fca5a5", fontSize: "0.85rem" }}>{error}</p>
      )}
      {!status && !error && <p style={{ color: "#64748b" }}>Checking the models…</p>}

      {status && (
        <>
          <div style={{ ...card, borderColor: problems.length ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.3)" }}>
            <h3 style={{ ...heading, color: problems.length ? "#fca5a5" : "#86efac" }}>
              {problems.length === 0 ? "Nothing is wrong"
                : problems.length === 1 ? "One thing needs a look" : `${problems.length} things need a look`}
            </h3>
            {problems.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
                Every model DIG uses is still offered by its provider.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#e2e8f0", fontSize: "0.85rem", lineHeight: 1.7 }}>
                {problems.map(p => <li key={p}>{p}</li>)}
              </ul>
            )}
            {(status.notes ?? []).map(n => (
              <p key={n} style={{ margin: "10px 0 0", color: "#64748b", fontSize: "0.78rem" }}>{n}</p>
            ))}
            {allowance && (
              <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: "0.8rem" }}>
                Free OpenRouter requests used today: {allowance.used} of {allowance.limit}.
              </p>
            )}
          </div>

          <div style={card}>
            <h3 style={heading}>The models</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <tbody>
                {(status.models ?? []).map(m => (
                  <tr key={`${m.provider}/${m.model}`} style={{ borderTop: "1px solid rgba(30,41,59,0.6)" }}>
                    <td style={{ padding: "10px 12px 10px 0", verticalAlign: "top" }}>
                      <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{m.name}</div>
                      <div style={{ color: "#475569", fontSize: "0.74rem" }}>
                        {PROVIDERS[m.provider] ?? m.provider} · used for {m.usedFor.join(", ")}
                      </div>
                    </td>
                    <td style={{ padding: "10px 0", verticalAlign: "top", textAlign: "right", whiteSpace: "nowrap",
                      color: STATUS[m.status]?.color ?? "#94a3b8", fontWeight: 600 }}>
                      {STATUS[m.status]?.label ?? m.status}
                      {m.expires && (
                        <div style={{ color: "#64748b", fontWeight: 400, fontSize: "0.74rem" }}>
                          until {m.expires}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={card}>
            <h3 style={heading}>The last {status.health?.windowHours ?? 24} hours</h3>
            {counted.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
                Nothing has been asked of the models since the server last restarted.
              </p>
            ) : counted.map(([key, label, failedMeans]) => (
              <p key={key} style={{ margin: "0 0 6px", fontSize: "0.85rem",
                color: outcomes[key].failed ? "#fde68a" : "#94a3b8" }}>
                {label}: {outcomes[key].total}, of which {outcomes[key].failed} {failedMeans}.
              </p>
            ))}
          </div>
        </>
      )}

      <div style={card}>
        <h3 style={heading}>The alarm</h3>
        <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6 }}>
          The server runs this check every six hours and emails you when something is wrong, and straight
          away when a report has to be written without AI. It stays silent when all is well.
        </p>
        <button onClick={sendTest} disabled={testing}
          style={{ padding: "8px 16px", borderRadius: "8px", border: "none",
            background: "rgba(37,99,235,0.3)", color: "#93c5fd", fontWeight: 600,
            fontSize: "0.83rem", cursor: testing ? "wait" : "pointer", opacity: testing ? 0.6 : 1 }}>
          {testing ? "Sending…" : "Send a test alert"}
        </button>
        {tested && (
          <p role="status" style={{ margin: "10px 0 0", fontSize: "0.83rem",
            color: tested.sent ? "#86efac" : "#fca5a5" }}>
            {tested.message}
          </p>
        )}
      </div>
    </div>
  );
}
