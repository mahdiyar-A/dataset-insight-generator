// @ts-nocheck
"use client";

import React from "react";
import { useRouter } from "next/navigation";

/**
 * PlanBadge — compact plan indicator shown in the dashboard sidebar.
 * Free users see an upgrade nudge. Pro/Admin users see their plan name.
 *
 * Props:
 *   plan        "free" | "pro" | "admin"
 *   reportsUsed number (free tier: used out of 2)
 */
export default function PlanBadge({ plan = "free", reportsUsed = 0 }) {
  const router = useRouter();

  if (plan === "admin") {
    return (
      <div style={{
        padding:    "8px 12px",
        borderRadius: "10px",
        background: "rgba(124,58,237,0.1)",
        border:     "1px solid rgba(124,58,237,0.25)",
        display:    "flex", alignItems: "center", gap: "8px",
      }}>
        <span style={{ fontSize: "0.75rem" }}>👑</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.78rem", color: "#c4b5fd" }}>
            Admin
          </p>
          <p style={{ margin: 0, fontSize: "0.68rem", color: "#581c87" }}>
            Full access
          </p>
        </div>
      </div>
    );
  }

  if (plan === "pro") {
    return (
      <div
        onClick={() => router.push("/dashboard/plan")}
        style={{
          padding:    "8px 12px", borderRadius: "10px", cursor: "pointer",
          background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)",
          display:    "flex", alignItems: "center", gap: "8px",
        }}>
        <span style={{ fontSize: "0.75rem" }}>⭐</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.78rem", color: "#93c5fd" }}>
            Pro
          </p>
          <p style={{ margin: 0, fontSize: "0.68rem", color: "#1e3a5f" }}>
            Unlimited · 15 slots
          </p>
        </div>
      </div>
    );
  }

  // Free
  const remaining = Math.max(0, 2 - reportsUsed);
  return (
    <div
      onClick={() => router.push("/plans")}
      style={{
        padding:    "8px 12px", borderRadius: "10px", cursor: "pointer",
        background: "rgba(30,41,59,0.5)", border: "1px solid rgba(30,41,59,0.7)",
        display:    "flex", alignItems: "center", gap: "8px",
        transition: "border-color 0.15s",
      }}>
      <span style={{ fontSize: "0.75rem" }}>🆓</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>
          Free plan
        </p>
        <p style={{ margin: 0, fontSize: "0.68rem",
          color: remaining === 0 ? "#f87171" : "#374151" }}>
          {remaining} of 2 analyses left
        </p>
      </div>
      <span style={{ fontSize: "0.65rem", color: "#3b82f6", fontWeight: 700,
        whiteSpace: "nowrap" }}>
        Upgrade →
      </span>
    </div>
  );
}
