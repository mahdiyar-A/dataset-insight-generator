"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

export default function InvitePage() {
  const router              = useRouter();
  const params              = useParams();
  const inviteToken         = params.token as string;
  const { token, user, isLoading } = useAuth();
  const [status,  setStatus]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoading && !token) {
      // Not logged in — redirect to login with return URL
      router.replace(`/login?redirectTo=/invite/${inviteToken}`);
    }
  }, [token, isLoading]);

  const handleAccept = async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const res = await BackendAPI.acceptInvite(token, inviteToken);
      setStatus("success");
      setMessage(`You've joined the team! Redirecting to your team page…`);
      setTimeout(() => router.push("/dashboard/team"), 2000);
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message || "Could not accept invitation.");
    }
  };

  if (isLoading || !token) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "440px", width: "100%", background: "rgba(15,23,42,0.9)",
        border: "1px solid rgba(30,41,59,0.8)", borderRadius: "20px", padding: "44px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img src="/d_dig.svg" alt="DIG" style={{ height: "36px" }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "1.4rem", fontWeight: 800,
          marginBottom: "10px" }}>
          Team invitation
        </h1>
        <p style={{ textAlign: "center", color: "#64748b", fontSize: "0.88rem",
          marginBottom: "32px" }}>
          You've been invited to join a collaboration team on DIG.
          Accept to access shared analyses and collaborate in real time.
        </p>

        {status === "idle" && (
          <button
            onClick={handleAccept}
            style={{ width: "100%", padding: "14px", borderRadius: "10px", border: "none",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff",
              fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
            Accept Invitation
          </button>
        )}

        {status === "loading" && (
          <p style={{ textAlign: "center", color: "#64748b" }}>Accepting…</p>
        )}

        {status === "success" && (
          <div style={{ padding: "16px", borderRadius: "10px",
            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
            color: "#6ee7b7", textAlign: "center", fontSize: "0.88rem" }}>
            ✓ {message}
          </div>
        )}

        {status === "error" && (
          <>
            <div style={{ padding: "16px", borderRadius: "10px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5", textAlign: "center", fontSize: "0.88rem",
              marginBottom: "16px" }}>
              {message}
            </div>
            {(user as any)?.plan !== "pro" && (
              <p style={{ textAlign: "center", fontSize: "0.82rem", color: "#64748b" }}>
                Note: joining a team requires a Pro plan.{" "}
                <button onClick={() => router.push("/plans")}
                  style={{ background: "none", border: "none", color: "#60a5fa",
                    cursor: "pointer", fontWeight: 600, padding: 0 }}>
                  Upgrade →
                </button>
              </p>
            )}
          </>
        )}

        <button onClick={() => router.push("/dashboard")}
          style={{ display: "block", margin: "20px auto 0", background: "none",
            border: "none", color: "#475569", fontSize: "0.82rem", cursor: "pointer" }}>
          Go to Dashboard instead
        </button>
      </div>
    </div>
  );
}
