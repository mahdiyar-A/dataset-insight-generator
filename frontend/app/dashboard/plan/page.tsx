"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { errorMessage } from "@/lib/types";
import type { UserPlan } from "@/lib/types";

/**
 * useSearchParams() opts the component out of static prerendering, and Next
 * requires that bail-out to happen inside a Suspense boundary. Without this
 * wrapper `next build` fails on this route — the dev server does not enforce it,
 * so the failure only appears in a production build.
 *
 * This route is reached from the Stripe success redirect (?upgraded=1), so it
 * must build cleanly or checkout dead-ends after payment.
 */
export default function PlanManagementPage() {
  return (
    <Suspense fallback={null}>
      <PlanManagementContent />
    </Suspense>
  );
}

function PlanManagementContent() {
  const router       = useRouter();
  const params       = useSearchParams();
  const { token, user, refreshUser, isLoading } = useAuth();
  const [planData,  setPlanData]  = useState<UserPlan | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [message,   setMessage]   = useState(
    params.get("upgraded") === "1" ? "🎉 Welcome to Pro! Your plan has been activated." : ""
  );

  useEffect(() => {
    if (!isLoading && !token) { router.replace("/login"); return; }
    if (token) {
      BackendAPI.getPlans(token)
        .then(d => { setPlanData(d.userPlan); })
        .catch(() => {});
      if (params.get("upgraded") === "1") refreshUser();
    }
  }, [token, isLoading]);

  const handleManage = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { url } = await BackendAPI.openBillingPortal(token);
      window.location.href = url;
    } catch (e) {
      setMessage(errorMessage(e) || "Could not open billing portal.");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !token) return null;

  const plan        = planData?.plan ?? user?.plan ?? "free";
  const isPro       = plan === "pro";
  const isAdmin     = plan === "admin";
  const expiresAt   = planData?.planExpiresAt
    ? new Date(planData.planExpiresAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const reportsUsed = planData?.reportsUsed ?? 0;
  const historyLimit = isPro || isAdmin ? 15 : 5;
  const reportsReset = planData?.reportsResetAt
    ? new Date(new Date(planData.reportsResetAt).getTime() + 48 * 3600 * 1000)
        .toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0",
      padding: "48px 24px", maxWidth: "680px", margin: "0 auto" }}>

      {/* Back */}
      <button onClick={() => router.push("/dashboard")}
        style={{ background: "none", border: "none", color: "#64748b",
          fontSize: "0.85rem", cursor: "pointer", marginBottom: "32px" }}>
        ← Back to Dashboard
      </button>

      <h1 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "8px" }}>
        Plan &amp; Billing
      </h1>

      {/* Success / error message */}
      {message && (
        <div style={{ padding: "14px 18px", borderRadius: "12px", marginBottom: "24px",
          background: message.includes("🎉")
            ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: message.includes("🎉")
            ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(239,68,68,0.3)",
          color: message.includes("🎉") ? "#6ee7b7" : "#fca5a5",
          fontSize: "0.88rem" }}>
          {message}
        </div>
      )}

      {/* Current plan card */}
      <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,41,59,0.8)",
        borderRadius: "16px", padding: "28px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: "0.82rem",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current plan
            </p>
            <h2 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800,
              color: isPro ? "#60a5fa" : isAdmin ? "#a78bfa" : "#e2e8f0" }}>
              {isAdmin ? "Admin" : isPro ? "Pro" : "Free"}
            </h2>
            {expiresAt && (
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.82rem" }}>
                Renews {expiresAt}
              </p>
            )}
          </div>
          <div style={{ padding: "6px 16px", borderRadius: "999px",
            background: isPro
              ? "rgba(37,99,235,0.15)" : isAdmin
              ? "rgba(124,58,237,0.15)" : "rgba(30,41,59,0.6)",
            border: isPro
              ? "1px solid rgba(37,99,235,0.35)" : isAdmin
              ? "1px solid rgba(124,58,237,0.35)" : "1px solid rgba(30,41,59,0.8)",
            color: isPro ? "#93c5fd" : isAdmin ? "#c4b5fd" : "#64748b",
            fontSize: "0.8rem", fontWeight: 600 }}>
            {isAdmin ? "Admin" : isPro ? "Pro · $9.99 CAD/mo" : "Free"}
          </div>
        </div>

        {/* Usage stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px", marginTop: "24px" }}>
          {[
            { label: "Analyses (48h)", value: isPro || isAdmin ? "∞" : `${reportsUsed} / 2`,
              sub: !isPro && !isAdmin && reportsReset ? `Resets at ${reportsReset}` : null },
            { label: "History slots", value: `${historyLimit}`,
              sub: isPro || isAdmin ? "Full history" : "Upgrade for 15" },
            { label: "Collaboration", value: isPro || isAdmin ? "✓ Enabled" : "✗ Locked",
              sub: isPro || isAdmin ? "Team workspace active" : "Requires Pro" },
          ].map(stat => (
            <div key={stat.label} style={{ background: "rgba(2,6,23,0.5)", borderRadius: "10px",
              padding: "14px", border: "1px solid rgba(30,41,59,0.6)" }}>
              <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "0.75rem",
                textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stat.label}
              </p>
              <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: "1.1rem",
                color: stat.value.includes("✓") ? "#10b981" : stat.value.includes("✗")
                  ? "#f87171" : "#e2e8f0" }}>
                {stat.value}
              </p>
              {stat.sub && <p style={{ margin: 0, color: "#475569", fontSize: "0.72rem" }}>{stat.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {!isPro && !isAdmin && (
          <button
            onClick={() => router.push("/plans")}
            style={{ flex: 1, minWidth: "180px", padding: "14px", borderRadius: "10px",
              border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}>
            Upgrade to Pro — $9.99/mo
          </button>
        )}
        {(isPro || isAdmin) && !isAdmin && (
          <button
            onClick={handleManage}
            disabled={loading}
            style={{ flex: 1, minWidth: "180px", padding: "14px", borderRadius: "10px",
              border: "1px solid rgba(59,130,246,0.35)", background: "transparent",
              color: "#93c5fd", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
              opacity: loading ? 0.7 : 1 }}>
            {loading ? "Opening portal…" : "Manage / Cancel subscription"}
          </button>
        )}
        <button
          onClick={() => router.push("/plans")}
          style={{ flex: 1, minWidth: "140px", padding: "14px", borderRadius: "10px",
            border: "1px solid rgba(30,41,59,0.8)", background: "transparent",
            color: "#64748b", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>
          Compare plans
        </button>
      </div>

      <p style={{ color: "#334155", fontSize: "0.75rem", marginTop: "24px", lineHeight: "1.6" }}>
        Payments are processed by Stripe. Cancel anytime — your Pro access continues until the
        end of the billing period. We never store your card details.
      </p>
    </div>
  );
}
