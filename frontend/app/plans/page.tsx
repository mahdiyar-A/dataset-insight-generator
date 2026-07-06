"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

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
      "Standard AI model",
      "PDF report export",
      "CSV download",
    ],
    missing: [
      "Unlimited analyses",
      "15 history slots",
      "Word & PowerPoint export",
      "Chatbot customization",
      "Team collaboration workspace",
      "Real-time cursors & annotations",
    ],
    cta:      "Current plan",
    ctaStyle: "outline",
  },
  {
    id:       "pro",
    name:     "Pro",
    price:    "$9.99",
    interval: "/ month CAD",
    badge:    "Most popular",
    features: [
      "Unlimited analyses",
      "15 history slots",
      "Full AI model (Gemini 2.5 Flash)",
      "PDF, Word & PowerPoint export",
      "Chatbot customization (language, tone, insight count)",
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
  const [userPlan, setUserPlan]    = useState<any>(null);
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
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
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
    } catch (e: any) {
      setError(e.message || "Could not open billing portal.");
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = userPlan?.plan ?? "free";

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0", padding: "60px 24px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "56px" }}>
        <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: "999px",
          background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
          fontSize: "0.78rem", color: "#93c5fd", marginBottom: "16px", letterSpacing: "0.05em" }}>
          PRICING
        </div>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800,
          background: "linear-gradient(135deg, #e2e8f0, #93c5fd)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          margin: "0 0 12px" }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color: "#64748b", fontSize: "1rem", maxWidth: "480px", margin: "0 auto" }}>
          Start free. Upgrade when you need collaboration, unlimited analyses, and premium exports.
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
                ? "linear-gradient(160deg, rgba(37,99,235,0.15), rgba(15,23,42,0.98))"
                : "rgba(15,23,42,0.8)",
              border: isPro ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(30,41,59,0.8)",
              borderRadius: "20px", padding: "36px",
              position: "relative", overflow: "hidden",
            }}>

              {/* Pro glow */}
              {isPro && <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "2px",
                background: "linear-gradient(90deg, #2563eb, #7c3aed, #2563eb)",
              }} />}

              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: "absolute", top: "20px", right: "20px",
                  background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)",
                  borderRadius: "999px", padding: "3px 12px",
                  fontSize: "0.72rem", color: "#c4b5fd", fontWeight: 600,
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan name */}
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 4px",
                  color: isPro ? "#bfdbfe" : "#e2e8f0" }}>
                  {plan.name}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "2.4rem", fontWeight: 800,
                    color: isPro ? "#60a5fa" : "#e2e8f0" }}>
                    {plan.price}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                    {plan.interval}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div style={{ marginBottom: "32px" }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start",
                    gap: "10px", marginBottom: "10px" }}>
                    <span style={{ color: "#10b981", fontSize: "0.9rem", flexShrink: 0,
                      marginTop: "1px" }}>✓</span>
                    <span style={{ fontSize: "0.88rem", color: "#cbd5e1" }}>{f}</span>
                  </div>
                ))}
                {plan.missing.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start",
                    gap: "10px", marginBottom: "10px", opacity: 0.35 }}>
                    <span style={{ color: "#4b5563", fontSize: "0.9rem", flexShrink: 0,
                      marginTop: "1px" }}>✗</span>
                    <span style={{ fontSize: "0.88rem", color: "#4b5563",
                      textDecoration: "line-through" }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isCurrent ? (
                <div style={{ padding: "12px", textAlign: "center", borderRadius: "10px",
                  border: "1px solid rgba(30,41,59,0.8)", color: "#64748b",
                  fontSize: "0.88rem", fontWeight: 600 }}>
                  ✓ Your current plan
                </div>
              ) : isPro && currentPlan === "pro" ? (
                <button
                  onClick={handleManage}
                  disabled={loading}
                  style={{ width: "100%", padding: "14px", borderRadius: "10px",
                    border: "1px solid rgba(59,130,246,0.4)", background: "transparent",
                    color: "#93c5fd", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>
                  Manage subscription
                </button>
              ) : (
                <button
                  onClick={isPro ? handleUpgrade : undefined}
                  disabled={loading || !isPro}
                  style={{ width: "100%", padding: "14px", borderRadius: "10px",
                    border: "none",
                    background: isPro
                      ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                      : "rgba(30,41,59,0.6)",
                    color: isPro ? "#fff" : "#64748b",
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
        <p style={{ textAlign: "center", color: "#f87171", marginTop: "24px", fontSize: "0.88rem" }}>
          {error}
        </p>
      )}

      {/* Payment note */}
      <p style={{ textAlign: "center", color: "#334155", fontSize: "0.78rem", marginTop: "36px" }}>
        Payments are processed securely by Stripe. We never store your card details.
        Cancel anytime from your billing portal.
      </p>

      {/* Back */}
      <div style={{ textAlign: "center", marginTop: "32px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "#475569",
            fontSize: "0.85rem", cursor: "pointer" }}>
          ← Back
        </button>
      </div>
    </div>
  );
}
