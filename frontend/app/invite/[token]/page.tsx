"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { errorMessage } from "@/lib/types";

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
    } catch (e) {
      setStatus("error");
      setMessage(errorMessage(e) || "Could not accept invitation.");
    }
  };

  if (isLoading || !token) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "440px", width: "100%", background: "var(--card)",
        border: "1px solid var(--line)", borderRadius: "0", padding: "44px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img src="/d_dig.svg" alt="DIG" style={{ height: "36px" }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "1.4rem", fontWeight: 800,
          marginBottom: "10px" }}>
          Team invitation
        </h1>
        <p style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: "0.88rem",
          marginBottom: "32px" }}>
          You've been invited to join a collaboration team on DIG.
          Accept to access shared analyses and collaborate in real time.
        </p>

        {status === "idle" && (
          <button
            onClick={handleAccept}
            style={{ width: "100%", padding: "14px", borderRadius: "0", border: "none",
              background: "linear-gradient(135deg, var(--cobalt), var(--cobalt))", color: "#fff",
              fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
            Accept Invitation
          </button>
        )}

        {status === "loading" && (
          <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>Accepting…</p>
        )}

        {status === "success" && (
          <div style={{ padding: "16px", borderRadius: "0",
            background: "color-mix(in srgb, var(--ok) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ok) 35%, transparent)",
            color: "var(--ok-text)", textAlign: "center", fontSize: "0.88rem" }}>
            ✓ {message}
          </div>
        )}

        {status === "error" && (
          <>
            <div style={{ padding: "16px", borderRadius: "0",
              background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
              color: "var(--danger-text)", textAlign: "center", fontSize: "0.88rem",
              marginBottom: "16px" }}>
              {message}
            </div>
            {user?.plan !== "pro" && (
              <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                Note: joining a team requires a Pro plan.{" "}
                <button onClick={() => router.push("/plans")}
                  style={{ background: "none", border: "none", color: "var(--cobalt-accent)",
                    cursor: "pointer", fontWeight: 600, padding: 0 }}>
                  Upgrade →
                </button>
              </p>
            )}
          </>
        )}

        <button onClick={() => router.push("/dashboard")}
          style={{ display: "block", margin: "20px auto 0", background: "none",
            border: "none", color: "var(--ink-faint)", fontSize: "0.82rem", cursor: "pointer" }}>
          Go to Dashboard instead
        </button>
      </div>
    </div>
  );
}
