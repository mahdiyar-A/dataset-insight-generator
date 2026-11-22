"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
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

  // Stripe tells the server about a payment separately, and that can land a few
  // seconds after the person is sent back here.
  const checksLeft = useRef(5);
  useEffect(() => {
    if (!token || params.get("upgraded") !== "1") return;
    if (planData?.plan === "pro" || checksLeft.current <= 0) return;
    checksLeft.current -= 1;
    const again = setTimeout(() => {
      BackendAPI.getPlans(token)
        .then(d => {
          setPlanData(d.userPlan);
          if (d.userPlan?.plan === "pro") refreshUser();
        })
        .catch(() => {});
    }, 3000);
    return () => clearTimeout(again);
  }, [token, planData]);

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
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)",
      padding: "48px 24px", maxWidth: "680px", margin: "0 auto" }}>

      {/* Back */}
      <button onClick={() => router.push("/dashboard")}
        style={{ background: "none", border: "none", color: "var(--ink-faint)",
          fontSize: "0.85rem", cursor: "pointer", marginBottom: "32px" }}>
        ← Back to Dashboard
      </button>

      <h1 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "8px" }}>
        Plan &amp; Billing
      </h1>

      {/* Success / error message */}
      {message && (
        <div style={{ padding: "14px 18px", borderRadius: "0", marginBottom: "24px",
          background: message.includes("🎉")
            ? "color-mix(in srgb, var(--ok) 10%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
          border: message.includes("🎉")
            ? "1px solid color-mix(in srgb, var(--ok) 35%, transparent)" : "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
          color: message.includes("🎉") ? "var(--ok-text)" : "var(--danger-text)",
          fontSize: "0.88rem" }}>
          {message}
        </div>
      )}

      {/* Current plan card */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: "0", padding: "28px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p style={{ margin: "0 0 6px", color: "var(--ink-faint)", fontSize: "0.82rem",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current plan
            </p>
            <h2 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800,
              color: isPro ? "var(--cobalt-accent)" : isAdmin ? "var(--cobalt-accent)" : "var(--ink)" }}>
              {isAdmin ? "Admin" : isPro ? "Pro" : "Free"}
            </h2>
            {/* "Paid through", not "Renews": a Pro who cancels keeps Pro to this
                date and is not renewed, and a free plan has nothing to renew. */}
            {isPro && expiresAt && (
              <p style={{ margin: "4px 0 0", color: "var(--ink-faint)", fontSize: "0.82rem" }}>
                Paid through {expiresAt}
              </p>
            )}
          </div>
          <div style={{ padding: "6px 16px", borderRadius: "0",
            background: isPro
              ? "color-mix(in srgb, var(--cobalt) 15%, transparent)" : isAdmin
              ? "color-mix(in srgb, var(--cobalt) 15%, transparent)" : "color-mix(in srgb, var(--card) 60%, transparent)",
            border: isPro
              ? "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)" : isAdmin
              ? "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)" : "1px solid var(--line)",
            color: isPro ? "var(--cobalt-accent)" : isAdmin ? "var(--cobalt-accent)" : "var(--ink-faint)",
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
            <div key={stat.label} style={{ background: "color-mix(in srgb, var(--card) 50%, transparent)", borderRadius: "0",
              padding: "14px", border: "1px solid var(--line)" }}>
              <p style={{ margin: "0 0 4px", color: "var(--ink-faint)", fontSize: "0.75rem",
                textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stat.label}
              </p>
              <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: "1.1rem",
                color: stat.value.includes("✓") ? "var(--ok-text)" : stat.value.includes("✗")
                  ? "#f87171" : "#e2e8f0" }}>
                {stat.value}
              </p>
              {stat.sub && <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.72rem" }}>{stat.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {!isPro && !isAdmin && (
          <button
            onClick={() => router.push("/plans")}
            style={{ flex: 1, minWidth: "180px", padding: "14px", borderRadius: "0",
              border: "none", background: "linear-gradient(135deg, var(--cobalt), var(--cobalt))",
              color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}>
            Upgrade to Pro — $9.99/mo
          </button>
        )}
        {(isPro || isAdmin) && !isAdmin && (
          <button
            onClick={handleManage}
            disabled={loading}
            style={{ flex: 1, minWidth: "180px", padding: "14px", borderRadius: "0",
              border: "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)", background: "transparent",
              color: "var(--cobalt-accent)", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
              opacity: loading ? 0.7 : 1 }}>
            {loading ? "Opening portal…" : "Manage / Cancel subscription"}
          </button>
        )}
        <button
          onClick={() => router.push("/plans")}
          style={{ flex: 1, minWidth: "140px", padding: "14px", borderRadius: "0",
            border: "1px solid var(--line)", background: "transparent",
            color: "var(--ink-faint)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>
          Compare plans
        </button>
      </div>

      <p style={{ color: "var(--ink-faint)", fontSize: "0.75rem", marginTop: "24px", lineHeight: "1.6" }}>
        Payments are processed by Stripe. Cancel anytime — your Pro access continues until the
        end of the billing period. We never store your card details.
      </p>
    </div>
  );
}
