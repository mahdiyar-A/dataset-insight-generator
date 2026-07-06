// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ChatCustomizationPanel — shown to Pro users before they start analysis.
 * Lets them configure how the AI generates the report.
 *
 * Props:
 *   onChange  (customization) → void   called whenever any option changes
 *   onUpgrade () → void                called when free user clicks upgrade
 *   isPro     boolean
 */
export default function ChatCustomizationPanel({ onChange, onUpgrade, isPro = false }) {
  const router = useRouter();

  const [open,  setOpen]  = useState(false);
  const [opts,  setOpts]  = useState({
    language:      "en",
    tone:          "professional",
    insightsCount: 5,
    occasion:      "general",
    outputFormat:  "pdf",
    includePptx:   false,
  });

  const update = (key, val) => {
    const next = { ...opts, [key]: val };
    setOpts(next);
    onChange?.(next);
  };

  if (!isPro) {
    return (
      <div style={{
        padding: "12px 16px", borderRadius: "10px", marginTop: "10px",
        background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.18)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
      }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: "0.83rem", fontWeight: 600,
            color: "#fde68a" }}>
            ⚡ Customize your report
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#92400e" }}>
            Language, tone, insight count, format & more — Pro feature
          </p>
        </div>
        <button
          onClick={onUpgrade ?? (() => router.push("/plans"))}
          style={{
            padding: "7px 14px", borderRadius: "8px", border: "none",
            background: "linear-gradient(135deg, #d97706, #b45309)",
            color: "#fff", fontWeight: 700, fontSize: "0.78rem",
            cursor: "pointer", whiteSpace: "nowrap",
          }}>
          Upgrade →
        </button>
      </div>
    );
  }

  const Select = ({ label, optKey, options }) => (
    <div style={{ flex: "1 1 140px" }}>
      <p style={{ margin: "0 0 6px", fontSize: "0.72rem", color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <select
        value={opts[optKey]}
        onChange={e => update(optKey, e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: "8px",
          border: "1px solid rgba(30,41,59,0.8)",
          background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
          fontSize: "0.83rem", cursor: "pointer", outline: "none",
        }}>
        {options.map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div style={{ marginTop: "10px" }}>
      {/* Toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          padding: "10px 14px", borderRadius: "10px", border: "none",
          background: open
            ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.6)",
          cursor: "pointer",
          borderLeft: "3px solid rgba(37,99,235,0.5)",
        }}>
        <span style={{ fontSize: "0.9rem" }}>⚙️</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: "0.85rem",
          fontWeight: 600, color: "#bfdbfe" }}>
          Report customization
        </span>
        <span style={{ color: "#475569", fontSize: "0.8rem",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s", display: "inline-block" }}>
          ▾
        </span>
      </button>

      {/* Options panel */}
      {open && (
        <div style={{
          marginTop: "8px", padding: "18px",
          background: "rgba(15,23,42,0.8)",
          border: "1px solid rgba(30,41,59,0.8)", borderRadius: "12px",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
            <Select label="Language" optKey="language" options={[
              ["en", "English"], ["fr", "French"], ["es", "Spanish"],
              ["de", "German"], ["zh", "Chinese"], ["ar", "Arabic"],
              ["fa", "Persian"],
            ]} />

            <Select label="Tone" optKey="tone" options={[
              ["professional", "Professional"],
              ["executive",    "Executive / Board"],
              ["academic",     "Academic"],
              ["casual",       "Casual / Friendly"],
              ["technical",    "Technical"],
            ]} />

            <Select label="Insights" optKey="insightsCount" options={[
              ["3", "3 insights"],
              ["5", "5 insights"],
              ["7", "7 insights"],
            ]} />

            <Select label="Occasion" optKey="occasion" options={[
              ["general",    "General report"],
              ["investor",   "Investor / pitch"],
              ["academic",   "Academic / research"],
              ["internal",   "Internal review"],
              ["client",     "Client presentation"],
            ]} />
          </div>

          {/* Output formats */}
          <div style={{ marginTop: "16px" }}>
            <p style={{ margin: "0 0 8px", fontSize: "0.72rem", color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Output formats
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {[
                { key: "pdf",  label: "📄 PDF",  always: true  },
                { key: "word", label: "📝 Word (.docx)"         },
                { key: "pptx", label: "📊 PowerPoint"           },
              ].map(f => {
                const active = f.always
                  || opts.outputFormat === f.key
                  || (f.key === "pptx" && opts.includePptx);

                return (
                  <button
                    key={f.key}
                    disabled={f.always}
                    onClick={() => {
                      if (f.key === "pptx") {
                        update("includePptx", !opts.includePptx);
                      } else if (!f.always) {
                        update("outputFormat", active ? "pdf" : f.key);
                      }
                    }}
                    style={{
                      padding: "7px 14px", borderRadius: "8px", cursor: f.always ? "default" : "pointer",
                      border: active
                        ? "1px solid rgba(37,99,235,0.4)" : "1px solid rgba(30,41,59,0.7)",
                      background: active
                        ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.6)",
                      color: active ? "#93c5fd" : "#4b5563",
                      fontSize: "0.82rem", fontWeight: active ? 600 : 400,
                    }}>
                    {f.label}
                    {f.always && <span style={{ marginLeft: "4px", fontSize: "0.65rem",
                      color: "#334155" }}>always</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div style={{ marginTop: "14px", padding: "10px 14px", borderRadius: "8px",
            background: "rgba(2,6,23,0.5)", border: "1px solid rgba(30,41,59,0.6)" }}>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569" }}>
              Will generate:{" "}
              <strong style={{ color: "#94a3b8" }}>
                {opts.insightsCount} insights
              </strong>
              {" · "}
              <strong style={{ color: "#94a3b8" }}>{opts.language.toUpperCase()}</strong>
              {" · "}
              <strong style={{ color: "#94a3b8" }}>{opts.tone}</strong>
              {" tone · "}
              <strong style={{ color: "#94a3b8" }}>
                PDF{opts.outputFormat === "word" ? " + Word" : ""}
                {opts.includePptx ? " + PPT" : ""}
              </strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
