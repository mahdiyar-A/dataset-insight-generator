// @ts-nocheck
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";

// Only structural data — all strings come from translations
const DOCS = [
  { id: "upload",  icon: "⬆" },
  { id: "run",     icon: "▶" },
  { id: "chatbot", icon: "💬" },
  { id: "report",  icon: "📄" },
];

const STEP_COUNT = 5; // each doc has exactly 5 steps

function DocModal({ docIdx, icon, onClose }) {
  const t = useTranslations("help");
  if (docIdx === null) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#020617",
          border: "1px solid rgba(31,41,55,0.9)",
          borderRadius: "18px",
          padding: "28px",
          maxWidth: "540px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(37,99,235,0.12)",
              border: "1px solid rgba(37,99,235,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#e5e7eb" }}>{t(`doc${docIdx}Title`)}</h3>
            <p className="muted-small" style={{ marginTop: "4px", lineHeight: "1.55" }}>{t(`doc${docIdx}Summary`)}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(15,23,42,0.9)",
              border: "1px solid rgba(55,65,81,0.8)",
              borderRadius: "8px",
              padding: "7px",
              color: "#6b7280",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(31,41,55,0.8)",
              }}
            >
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "rgba(37,99,235,0.15)",
                  border: "1px solid rgba(37,99,235,0.35)",
                  color: "#bfdbfe",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {i + 1}
              </div>
              <p
                className="muted-small"
                style={{ margin: 0, lineHeight: "1.6", color: "#d1d5db" }}
              >
                {t(`doc${docIdx}Step${i}`)}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid rgba(31,41,55,0.8)", paddingTop: "14px" }}>
          <p className="muted-small">
            {t("stillNeedHelp")}{" "}
            <a href={`mailto:${t("supportEmail")}`} style={{ color: "#93c5fd", textDecoration: "none" }}>
              {t("supportEmail")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InfoCards() {
  const t = useTranslations("help");
  const [activeDocIdx, setActiveDocIdx] = useState(null);
  const activeDoc = activeDocIdx !== null ? DOCS[activeDocIdx] : null;

  return (
    <>
      {activeDoc && <DocModal docIdx={activeDocIdx} icon={activeDoc.icon} onClose={() => setActiveDocIdx(null)} />}

      <div className="lower-grid">

        {/* ── Help Center ── */}
        <div className="card info-card">
          <h2>{t("helpCenterTitle")}</h2>
          <p className="muted-small" style={{ marginBottom: "14px" }}>
            {t("helpCenterDesc")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {DOCS.map((doc, idx) => (
              <button
                key={doc.id}
                onClick={() => setActiveDocIdx(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.9)",
                  border: "1px solid rgba(31,41,55,0.9)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#d1d5db",
                  fontSize: "0.82rem",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.45)";
                  e.currentTarget.style.background = "rgba(37,99,235,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(31,41,55,0.9)";
                  e.currentTarget.style.background = "rgba(15,23,42,0.9)";
                }}
              >
                <span style={{ fontSize: "15px" }}>{doc.icon}</span>
                <span style={{ flex: 1, fontWeight: 500 }}>{t(`doc${idx}Title`)}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* ── Contact Support ── */}
        <div className="card info-card" style={{ gridColumn: "2 / span 2" }}>
          <h2>{t("contactSupportTitle")}</h2>
          <p className="muted-small" style={{ marginBottom: "14px" }}>
            {t("contactSupportDesc")}
          </p>

          {/* Email button */}
          <a
            href="mailto:support.dig@proton.me"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 14px",
              background: "rgba(22,163,74,0.1)",
              border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: "10px",
              color: "#bbf7d0",
              textDecoration: "none",
              fontSize: "0.88rem",
              fontWeight: 600,
              marginBottom: "14px",
              transition: "background 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            support.dig@proton.me
          </a>

          {/* Channel table */}
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Response time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>✉ Email</td>
                <td>1–2 business days</td>
              </tr>
              <tr>
                <td>💬 Live chat</td>
                <td>Coming soon</td>
              </tr>
              <tr>
                <td>🐛 GitHub Issues</td>
                <td>Within 48 hours</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}