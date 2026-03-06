// @ts-nocheck
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";

export default function ProfileViewPage() {
  const router = useRouter();
  const { currentUser, isLoading, refreshUser } = useAuth();

  // Refresh from backend every time this page is visited
  useEffect(() => { refreshUser(); }, []);

  if (isLoading) return <div style={loadingStyle}>Loading…</div>;
  if (!currentUser) return <div style={loadingStyle}>Not authenticated.</div>;

  const parts       = (currentUser.userName ?? "").split(" ");
  const firstName   = currentUser.firstName ?? parts[0]             ?? "—";
  const lastName    = currentUser.lastName  ?? parts.slice(1).join(" ") ?? "—";
  const displayName = `${firstName} ${lastName}`.trim() || currentUser.userName || "User";
  const initial     = (firstName?.charAt(0) || currentUser.userName?.charAt(0) || "U").toUpperCase();
  const avatarUrl   = currentUser.profilePicture ?? null;
  const memberSince = currentUser.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString("en-CA", { month: "long", year: "numeric" })
    : null;

  const rows = [
    { label: "First name",    value: firstName },
    { label: "Last name",     value: lastName },
    { label: "Display name",  value: currentUser.userName || "—" },
    { label: "Phone",         value: currentUser.phoneNumber || "—" },
    { label: "Email",         value: currentUser.email || "—" },
    { label: "Member since",  value: memberSince || "—" },
  ];

  return (
    <div style={pageStyle}>
      <div style={{ padding: "16px 24px 0" }}>
        <a href="/dashboard" style={ghostLink}>← Back to Dashboard</a>
      </div>

      <div style={wrapStyle}>
        <section style={cardStyle}>
          {/* Header row */}
          <div style={headerRowStyle}>
            <div style={bigAvatarStyle}>
              {avatarUrl
                ? <img src={avatarUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "18px" }} />
                : initial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ margin: 0, color: "#e5e7eb", fontSize: "1.1rem", fontWeight: 800 }}>{displayName}</h2>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>{currentUser.email}</p>
              {memberSince && (
                <p style={{ margin: "4px 0 0", color: "#4b5563", fontSize: "0.75rem" }}>Member since {memberSince}</p>
              )}
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "0.78rem", fontStyle: "italic" }}>
                View only — edit in Account Settings.
              </p>
            </div>
          </div>

          {/* Info table */}
          <div style={infoTableStyle}>
            {rows.map((row) => (
              <div key={row.label} style={infoRowStyle}>
                <span style={labelStyle}>{row.label}</span>
                <span style={valueStyle}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
            <button style={secondaryBtn} onClick={() => router.push("/dashboard/editProfile")}>
              Edit in Account Settings →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

const pageStyle      = { minHeight: "100vh", background: "radial-gradient(circle at top, #020617 0, #020617 45%, #000 100%)", fontFamily: "system-ui, -apple-system, sans-serif", color: "#e5e7eb" };
const wrapStyle      = { maxWidth: "560px", margin: "24px auto", padding: "0 24px 48px" };
const cardStyle      = { background: "rgba(15,23,42,0.95)", borderRadius: "18px", border: "1px solid rgba(31,41,55,0.8)", padding: "24px", boxShadow: "0 18px 45px rgba(15,23,42,0.85)", display: "flex", flexDirection: "column", gap: "16px" };
const headerRowStyle = { display: "flex", gap: "16px", alignItems: "center" };
const bigAvatarStyle = { width: "68px", height: "68px", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "28px", color: "#fff", background: "linear-gradient(135deg, #3b82f6, #6366f1)", overflow: "hidden", flexShrink: 0 };
const infoTableStyle = { display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(31,41,55,0.8)", paddingTop: "16px" };
const infoRowStyle   = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" };
const labelStyle     = { color: "#9ca3af", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };
const valueStyle     = { color: "#d1d5db", fontSize: "0.85rem", textAlign: "right", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const ghostLink      = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "0.82rem", textDecoration: "none", borderRadius: "999px", border: "1px solid rgba(148,163,184,0.3)", color: "#bfdbfe", background: "rgba(15,23,42,0.8)" };
const secondaryBtn   = { padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(55,65,81,0.9)", background: "transparent", color: "#e5e7eb", fontSize: "0.82rem", cursor: "pointer" };
const loadingStyle   = { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#6b7280", fontSize: "0.9rem", background: "#020617" };