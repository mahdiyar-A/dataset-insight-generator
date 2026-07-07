// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ChatCustomizationPanel — Pro-only report customization before analysis starts.
 *
 * Every option here maps directly to a pipeline parameter that meaningfully
 * changes the output — not just a style hint, but the actual report structure,
 * analytical focus, persona, and format.
 *
 * Props:
 *   onChange    (customization) → void  called on any change
 *   onUpgrade   () → void               called when free user clicks upgrade
 *   isPro       boolean
 */

const DEFAULT = {
  // Language & voice
  language:      "en",
  tone:          "professional",
  audience:      "general",
  // Depth & scope
  depth:         "standard",
  insightsCount: 5,
  occasion:      "general",
  // Analytical directives
  focusOn:       "",
  comparisons:   "",
  mustMention:   [],          // array of strings
  // Visual preferences
  chartStyle:    "mixed",
  // Section toggles
  includeMethodology: true,
  includeConfidence:  true,
  // Output formats
  outputFormat: { pdf: true, word: false, pptx: false },
};

// ── Locked banner for free users ──────────────────────────────────────────────
function LockedBanner({ onUpgrade }) {
  const router = useRouter();
  return (
    <div style={{
      padding: "12px 16px", borderRadius: "10px", marginTop: "10px",
      background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.18)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
    }}>
      <div>
        <p style={{ margin: "0 0 2px", fontSize: "0.83rem", fontWeight: 600, color: "#fde68a" }}>
          ⚡ Customize your report
        </p>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#92400e" }}>
          Language, tone, audience, focus areas, Word &amp; PPT exports — Pro only
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

// ── Shared select ──────────────────────────────────────────────────────────────
function Sel({ label, value, onChange, options, flex = "1 1 140px" }) {
  return (
    <div style={{ flex }}>
      <p style={{ margin: "0 0 5px", fontSize: "0.7rem", color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}
      </p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "7px 10px", borderRadius: "7px",
          border: "1px solid rgba(30,41,59,0.8)",
          background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
          fontSize: "0.82rem", cursor: "pointer", outline: "none",
        }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

// ── Toggle chip ────────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 13px", borderRadius: "7px",
        cursor: disabled ? "default" : "pointer",
        border: active ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(30,41,59,0.7)",
        background: active ? "rgba(37,99,235,0.14)" : "rgba(15,23,42,0.6)",
        color: active ? "#93c5fd" : "#4b5563",
        fontSize: "0.8rem", fontWeight: active ? 600 : 400,
        transition: "all 0.15s",
      }}>
      {label}
    </button>
  );
}

// ── Section divider ────────────────────────────────────────────────────────────
function SectionLabel({ text }) {
  return (
    <p style={{
      margin: "16px 0 8px", fontSize: "0.68rem", color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
      borderBottom: "1px solid rgba(30,41,59,0.5)", paddingBottom: "4px",
    }}>{text}</p>
  );
}

// ── Must-mention tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange }) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  };

  return (
    <div>
      <p style={{ margin: "0 0 5px", fontSize: "0.7rem", color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        Must mention
      </p>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px",
        borderRadius: "7px", border: "1px solid rgba(30,41,59,0.8)",
        background: "rgba(15,23,42,0.9)", minHeight: "38px", alignItems: "center",
      }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "2px 8px", borderRadius: "5px",
            background: "rgba(99,102,241,0.18)", color: "#a5b4fc", fontSize: "0.78rem",
          }}>
            {tag}
            <button
              onClick={() => onChange(tags.filter(t => t !== tag))}
              style={{
                background: "none", border: "none", color: "#6366f1",
                cursor: "pointer", padding: 0, fontSize: "0.9rem", lineHeight: 1,
              }}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          placeholder={tags.length ? "Add more…" : "e.g. revenue, Q4, outliers"}
          style={{
            flex: "1 1 120px", background: "none", border: "none", outline: "none",
            color: "#e2e8f0", fontSize: "0.82rem", minWidth: "80px",
          }}
        />
        {input.trim() && (
          <button onClick={add} style={{
            padding: "2px 8px", borderRadius: "5px", border: "none",
            background: "rgba(99,102,241,0.25)", color: "#a5b4fc",
            fontSize: "0.75rem", cursor: "pointer",
          }}>add</button>
        )}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "#334155" }}>
        Topics or column names the report must address. Press Enter to add.
      </p>
    </div>
  );
}

// ── Summary line ───────────────────────────────────────────────────────────────
function SummaryLine({ opts }) {
  const LANG = { en:"EN", fr:"FR", es:"ES", de:"DE", zh:"ZH", ar:"AR", pt:"PT", fa:"FA" };
  const DEPTH_LABEL = { quick:"Quick scan", standard:"Standard", deep:"Deep dive" };
  const formats = ["PDF",
    opts.outputFormat.word && "Word",
    opts.outputFormat.pptx && "PPT"]
    .filter(Boolean).join(" + ");
  const directives = [
    opts.focusOn && "custom focus",
    opts.comparisons && "comparison",
    opts.mustMention.length && `${opts.mustMention.length} must-mention${opts.mustMention.length > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <div style={{
      marginTop: "14px", padding: "10px 14px", borderRadius: "8px",
      background: "rgba(2,6,23,0.5)", border: "1px solid rgba(30,41,59,0.6)",
    }}>
      <p style={{ margin: 0, fontSize: "0.77rem", color: "#475569", lineHeight: 1.7 }}>
        <strong style={{ color: "#94a3b8" }}>{LANG[opts.language] || "EN"}</strong>
        {" · "}
        <strong style={{ color: "#94a3b8" }}>{opts.tone}</strong>
        {" · "}
        <strong style={{ color: "#94a3b8" }}>{opts.audience}</strong>
        {" audience · "}
        <strong style={{ color: "#94a3b8" }}>{DEPTH_LABEL[opts.depth] || opts.depth}</strong>
        {" · "}
        <strong style={{ color: "#94a3b8" }}>{opts.insightsCount} insights</strong>
        {" · "}
        <strong style={{ color: opts.chartStyle !== "mixed" ? "#c4b5fd" : "#94a3b8" }}>
          {opts.chartStyle} charts
        </strong>
        {" · "}
        <strong style={{ color: "#94a3b8" }}>{formats}</strong>
        {directives.length > 0 && (
          <span> · <strong style={{ color: "#fbbf24" }}>{directives.join(", ")}</strong></span>
        )}
      </p>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function ChatCustomizationPanel({ onChange, onUpgrade, isPro = false }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(DEFAULT);

  if (!isPro) return <LockedBanner onUpgrade={onUpgrade} />;

  const set = (key, val) => {
    const next = { ...opts, [key]: val };
    setOpts(next);
    onChange?.(next);
  };

  const setFmt = (key, val) => {
    const next = { ...opts, outputFormat: { ...opts.outputFormat, [key]: val } };
    setOpts(next);
    onChange?.(next);
  };

  // Count active directives for the badge
  const directiveCount = [opts.focusOn, opts.comparisons, ...opts.mustMention].filter(Boolean).length;

  return (
    <div style={{ marginTop: "10px" }}>

      {/* ── Collapse toggle ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          padding: "10px 14px", borderRadius: "10px", border: "none",
          background: open ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.6)",
          cursor: "pointer", borderLeft: "3px solid rgba(37,99,235,0.5)",
        }}>
        <span style={{ fontSize: "0.9rem" }}>⚙️</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: "0.85rem",
          fontWeight: 600, color: "#bfdbfe" }}>
          Customize report
        </span>
        {!open && directiveCount > 0 && (
          <span style={{
            padding: "1px 7px", borderRadius: "10px",
            background: "rgba(251,191,36,0.18)", color: "#fbbf24",
            fontSize: "0.7rem", fontWeight: 700,
          }}>
            {directiveCount} directive{directiveCount > 1 ? "s" : ""}
          </span>
        )}
        <span style={{
          color: "#475569", fontSize: "0.8rem",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s", display: "inline-block",
        }}>▾</span>
      </button>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {open && (
        <div style={{
          marginTop: "8px", padding: "18px",
          background: "rgba(15,23,42,0.8)",
          border: "1px solid rgba(30,41,59,0.8)", borderRadius: "12px",
        }}>

          {/* ── ANALYTICAL DIRECTIVES ──────────────────────────────────── */}
          <SectionLabel text="Analytical directives — what the AI focuses on" />
          <p style={{ margin: "0 0 10px", fontSize: "0.74rem", color: "#334155" }}>
            These override the AI&apos;s default choices. The most impactful settings.
          </p>

          {/* Focus on */}
          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "0 0 5px", fontSize: "0.7rem", color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Focus on
            </p>
            <input
              type="text"
              value={opts.focusOn}
              onChange={e => set("focusOn", e.target.value)}
              placeholder='e.g. "revenue trends vs cost" or "employee retention drivers"'
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "7px",
                border: opts.focusOn ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(30,41,59,0.8)",
                background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
                fontSize: "0.82rem", outline: "none", boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "#334155" }}>
              All insights will be shaped around this primary directive.
            </p>
          </div>

          {/* Comparison */}
          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "0 0 5px", fontSize: "0.7rem", color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Comparison
            </p>
            <input
              type="text"
              value={opts.comparisons}
              onChange={e => set("comparisons", e.target.value)}
              placeholder='e.g. "male vs female" or "Q1 vs Q2" or "high vs low performers"'
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "7px",
                border: opts.comparisons ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(30,41,59,0.8)",
                background: "rgba(15,23,42,0.9)", color: "#e2e8f0",
                fontSize: "0.82rem", outline: "none", boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "#334155" }}>
              Forces at least one insight and one chart to directly compare these groups.
            </p>
          </div>

          {/* Must mention */}
          <TagInput tags={opts.mustMention} onChange={v => set("mustMention", v)} />

          {/* ── VOICE & AUDIENCE ───────────────────────────────────────── */}
          <SectionLabel text="Voice & audience — who is reading this" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <Sel label="Audience" value={opts.audience} onChange={v => set("audience", v)}
              options={[
                ["general",   "General"],
                ["executive", "Executive / C-suite"],
                ["technical", "Technical / data team"],
                ["client",    "Client / external"],
                ["student",   "Student / educational"],
              ]} />

            <Sel label="Tone" value={opts.tone} onChange={v => set("tone", v)}
              options={[
                ["professional", "Professional"],
                ["technical",    "Technical / statistical"],
                ["storytelling", "Storytelling / narrative"],
                ["casual",       "Casual / friendly"],
                ["academic",     "Academic / research"],
                ["simplified",   "Simplified / plain language"],
              ]} />

            <Sel label="Language" value={opts.language} onChange={v => set("language", v)}
              options={[
                ["en", "English"], ["fr", "French"], ["es", "Spanish"],
                ["de", "German"],  ["zh", "Chinese"], ["ar", "Arabic"],
                ["pt", "Portuguese"], ["fa", "Persian"],
              ]} />
          </div>

          {/* Context hint for non-default voice settings */}
          {(opts.audience !== "general" || opts.tone !== "professional") && (
            <p style={{
              margin: "8px 0 0", fontSize: "0.72rem", color: "#475569",
              padding: "6px 10px", borderRadius: "6px",
              background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
            }}>
              {opts.audience === "executive"  && "→ KPI language, short insights, every finding tied to business impact. "}
              {opts.audience === "technical"  && "→ Statistical evidence, p-values, precise numerical claims. "}
              {opts.audience === "client"     && "→ Polished, client-ready language, no internal jargon. "}
              {opts.audience === "student"    && "→ Educational tone, concepts explained inline. "}
              {opts.tone === "storytelling"   && "Each insight continues a narrative arc. "}
              {opts.tone === "simplified"     && 'Plain English — every finding gets a "in plain terms:" summary. '}
              {opts.tone === "academic"       && "Research framing, hedged language, statistical tests cited. "}
            </p>
          )}

          {/* ── DEPTH & SCOPE ──────────────────────────────────────────── */}
          <SectionLabel text="Depth & scope" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <Sel label="Report depth" value={opts.depth} onChange={v => set("depth", v)}
              flex="2 1 240px"
              options={[
                ["quick",    "Quick scan — 3 insights, 3 charts, no methodology"],
                ["standard", "Standard — 5 insights, 5 charts"],
                ["deep",     "Deep dive — 7 insights, 7 charts, full methodology"],
              ]} />

            <Sel label="Insights" value={String(opts.insightsCount)}
              onChange={v => set("insightsCount", Number(v))}
              flex="0 1 90px"
              options={[["3","3"], ["5","5"], ["7","7"]]} />

            <Sel label="Occasion" value={opts.occasion} onChange={v => set("occasion", v)}
              options={[
                ["general",  "General report"],
                ["investor", "Investor / pitch"],
                ["academic", "Academic / research"],
                ["internal", "Internal team review"],
                ["client",   "Client deliverable"],
              ]} />
          </div>

          {/* ── CHARTS ─────────────────────────────────────────────────── */}
          <SectionLabel text="Chart style" />
          <Sel label="Preferred chart types" value={opts.chartStyle}
            onChange={v => set("chartStyle", v)}
            flex="100%"
            options={[
              ["mixed",        "Mixed — variety across chart types (default)"],
              ["bar-heavy",    "Bar-heavy — prefer bar and grouped bar"],
              ["trend",        "Trend-focused — line charts and time series"],
              ["distribution", "Distribution — histograms, box plots, scatter"],
              ["comparison",   "Comparison — side-by-side grouped bars, box-per-category"],
            ]} />

          {/* ── SECTIONS ───────────────────────────────────────────────── */}
          <SectionLabel text="Include in report" />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Chip
              label="📊 Methodology"
              active={opts.includeMethodology}
              onClick={() => set("includeMethodology", !opts.includeMethodology)}
            />
            <Chip
              label="🎯 Confidence score"
              active={opts.includeConfidence}
              onClick={() => set("includeConfidence", !opts.includeConfidence)}
            />
          </div>

          {/* ── OUTPUT FORMATS ─────────────────────────────────────────── */}
          <SectionLabel text="Output formats" />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {/* PDF always on */}
            <Chip label="📄 PDF" active disabled />
            <Chip
              label="📝 Word (.docx)"
              active={opts.outputFormat.word}
              onClick={() => setFmt("word", !opts.outputFormat.word)}
            />
            <Chip
              label="📊 PowerPoint"
              active={opts.outputFormat.pptx}
              onClick={() => setFmt("pptx", !opts.outputFormat.pptx)}
            />
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "0.7rem", color: "#334155" }}>
            PDF is always included. Word and PowerPoint are additional Pro exports.
          </p>

          <SummaryLine opts={opts} />
        </div>
      )}
    </div>
  );
}
