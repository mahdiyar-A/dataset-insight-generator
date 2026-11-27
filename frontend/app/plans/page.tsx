"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { CheckIcon, CrossIcon } from "@/components/Icons";
import { errorMessage } from "@/lib/types";
import type { UserPlan } from "@/lib/types";

// ── Static plan definitions (mirrors PlansController) ──────────────────────────
const PLANS = [
  {
    id:       "free",
    name:     "Free",
    price:    "$0",
    interval: "forever",
    badge:    null,
    features: [
      "2 analyses per 48 hours",
      "5 history slots",
      "AI-written report",
      "PDF report export",
      "CSV download",
      "10 questions a day about your analyses",
    ],
    missing: [
      "Up to 20 analyses a day",
      "15 history slots",
      "Word & PowerPoint export",
      "100 questions a day about your analyses",
      "Report customization, in your own words or by hand",
      "Team collaboration workspace",
      "Real-time cursors & annotations",
    ],
    // Only shown to a Pro member: a Free member sees "Your current plan".
    cta:      "Included in Pro",
    ctaStyle: "outline",
  },
  {
    id:       "pro",
    name:     "Pro",
    price:    "$9.99",
    interval: "/ month CAD",
    badge:    null,
    features: [
      "Up to 20 analyses a day",
      "15 history slots",
      "AI-written report",
      "PDF, Word & PowerPoint export",
      "100 questions a day about your analyses",
      "Report customization, in your own words or by hand (focus, assumptions, questions, language, tone)",
      "Team collaboration workspace",
      "Real-time cursors & annotations",
      "Priority support",
    ],
    missing:  [],
    cta:      "Upgrade to Pro",
    ctaStyle: "primary",
  },
];

export default function PlansPage() {
  const router                    = useRouter();
  const { token, user, isLoading } = useAuth();
  const [userPlan, setUserPlan]    = useState<UserPlan | null>(null);
  const [loading,  setLoading]     = useState(false);
  const [error,    setError]       = useState("");

  useEffect(() => {
    if (!isLoading && token) {
      BackendAPI.getPlans(token)
        .then(d => setUserPlan(d.userPlan))
        .catch(() => {});
    }
  }, [token, isLoading]);

  const handleUpgrade = async () => {
    if (!token) { router.push("/login"); return; }
    setLoading(true);
    setError("");
    try {
      const { url } = await BackendAPI.subscribePro(token);
      window.location.href = url; // Redirect to Stripe Checkout
    } catch (e) {
      setError(errorMessage(e) || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { url } = await BackendAPI.openBillingPortal(token);
      window.location.href = url; // Stripe Billing Portal
    } catch (e) {
      setError(errorMessage(e) || "Could not open billing portal.");
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = userPlan?.plan ?? "free";
  // Signed out, there is no current plan: both cards lead to Register. Until
  // sign-in is known, neither is shown, so a signed-in visitor never sees a
  // Register button flash past.
  const signedIn = !isLoading && !!token;
  const signedOut = !isLoading && !token;
  const cta = { width: "100%", padding: "14px", borderRadius: "0", fontSize: "0.9rem", fontWeight: 700 } as const;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", padding: "60px 24px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "56px" }}>
        <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: "0",
          background: "color-mix(in srgb, var(--cobalt) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)",
          fontSize: "0.78rem", color: "var(--cobalt-accent)", marginBottom: "16px", letterSpacing: "0.05em" }}>
          PRICING
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", fontWeight: 800,
          color: "var(--ink)", lineHeight: 1.05, margin: "0 0 12px" }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color: "var(--ink-faint)", fontSize: "1rem", maxWidth: "480px", margin: "0 auto" }}>
          Start free. Upgrade when you need collaboration, more analyses, and premium exports.
        </p>
      </div>

      {/* Plan cards */}
      <div style={{ display: "flex", gap: "24px", maxWidth: "860px", margin: "0 auto",
        flexWrap: "wrap", justifyContent: "center" }}>
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          const isPro     = plan.id === "pro";

          return (
            <div key={plan.id} style={{
              flex: "1 1 360px", maxWidth: "400px",
              background: isPro
                ? "linear-gradient(160deg, color-mix(in srgb, var(--cobalt) 15%, transparent), var(--card))"
                : "color-mix(in srgb, var(--card) 80%, transparent)",
              border: isPro ? "1px solid var(--cobalt-accent)" : "1px solid var(--line)",
              borderRadius: "0", padding: "36px",
              position: "relative", overflow: "hidden",
            }}>

              {/* Pro glow */}
              {isPro && <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "2px",
                background: "linear-gradient(90deg, var(--cobalt), var(--cobalt), var(--cobalt))",
              }} />}

              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: "absolute", top: "20px", right: "20px",
                  background: "color-mix(in srgb, var(--cobalt) 20%, transparent)", border: "1px solid color-mix(in srgb, var(--cobalt) 40%, transparent)",
                  borderRadius: "0", padding: "3px 12px",
                  fontSize: "0.72rem", color: "var(--cobalt-accent)", fontWeight: 600,
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan name */}
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 4px",
                  color: isPro ? "var(--cobalt-accent)" : "var(--ink)" }}>
                  {plan.name}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "2.4rem", fontWeight: 800,
                    color: isPro ? "var(--cobalt-accent)" : "var(--ink)" }}>
                    {plan.price}
                  </span>
                  <span style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}>
                    {plan.interval}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div style={{ marginBottom: "32px" }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start",
                    gap: "10px", marginBottom: "10px" }}>
                    <span style={{ color: "var(--ok-text)", flexShrink: 0, marginTop: "2px" }}>
                      <CheckIcon size={14} />
                    </span>
                    <span style={{ fontSize: "0.88rem", color: "var(--ink)" }}>{f}</span>
                  </div>
                ))}
                {plan.missing.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start",
                    gap: "10px", marginBottom: "10px", opacity: 0.35 }}>
                    <span style={{ color: "var(--ink-faint)", flexShrink: 0, marginTop: "2px" }}>
                      <CrossIcon size={14} />
                    </span>
                    <span style={{ fontSize: "0.88rem", color: "var(--ink-faint)",
                      textDecoration: "line-through" }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isLoading ? (
                <div aria-hidden="true" style={{ height: "48px" }} />
              ) : signedOut ? (
                <Link href="/register" style={{
                  ...cta, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box",
                  border: isPro ? "2px solid var(--rule)" : "2px solid var(--ink)",
                  background: isPro ? "var(--lime)" : "var(--ink)",
                  color: isPro ? "#12121a" : "var(--paper)",
                }}>
                  {isPro ? "Start free, upgrade anytime" : "Create a free account"}
                </Link>
              ) : signedIn && isCurrent ? (
                <div style={{ padding: "12px", textAlign: "center", borderRadius: "0",
                  border: "1px solid var(--line)", color: "var(--ink-faint)",
                  fontSize: "0.88rem", fontWeight: 600 }}>
                  <CheckIcon size={13} /> Your current plan
                </div>
              ) : isPro && currentPlan === "pro" ? (
                <button
                  onClick={handleManage}
                  disabled={loading}
                  style={{ width: "100%", padding: "14px", borderRadius: "0",
                    border: "1px solid color-mix(in srgb, var(--cobalt) 40%, transparent)", background: "transparent",
                    color: "var(--cobalt-accent)", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>
                  Manage subscription
                </button>
              ) : (
                <button
                  onClick={isPro ? handleUpgrade : undefined}
                  disabled={loading || !isPro}
                  style={{ width: "100%", padding: "14px", borderRadius: "0",
                    border: "none",
                    background: isPro
                      ? "linear-gradient(135deg, var(--cobalt), var(--cobalt))"
                      : "color-mix(in srgb, var(--card) 60%, transparent)",
                    color: isPro ? "var(--ink)" : "var(--ink-faint)",
                    fontSize: "0.9rem", fontWeight: 700,
                    cursor: isPro ? "pointer" : "default",
                    opacity: loading ? 0.7 : 1 }}>
                  {loading && isPro ? "Redirecting…" : plan.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <p style={{ textAlign: "center", color: "var(--danger-text)", marginTop: "24px", fontSize: "0.88rem" }}>
          {error}
        </p>
      )}

      {/* Payment note */}
      <p style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: "0.78rem", marginTop: "36px" }}>
        Cancel Pro anytime.
      </p>

      {/* Back */}
      <div style={{ textAlign: "center", marginTop: "32px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "var(--ink-faint)",
            fontSize: "0.85rem", cursor: "pointer" }}>
          ← Back
        </button>
      </div>
    </div>
  );
}
