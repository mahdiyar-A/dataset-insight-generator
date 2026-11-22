"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";

export default function ProfileViewPage() {
  const router = useRouter();
  const { user: currentUser, isLoading, refreshUser } = useAuth();

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
                ? <img src={avatarUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "0"}} />
                : initial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: "1.1rem", fontWeight: 800 }}>{displayName}</h2>
              <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: "0.85rem" }}>{currentUser.email}</p>
              {memberSince && (
                <p style={{ margin: "4px 0 0", color: "var(--ink-faint)", fontSize: "0.75rem" }}>Member since {memberSince}</p>
              )}
              <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: "0.78rem", fontStyle: "italic" }}>
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

const pageStyle: React.CSSProperties      = { minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" };
const wrapStyle: React.CSSProperties      = { maxWidth: "560px", margin: "24px auto", padding: "0 24px 48px" };
const cardStyle: React.CSSProperties      = { background: "var(--card)", borderRadius: "0", border: "1px solid var(--line)", padding: "24px", boxShadow: "0 18px 45px rgba(15,23,42,0.85)", display: "flex", flexDirection: "column", gap: "16px" };
const headerRowStyle: React.CSSProperties = { display: "flex", gap: "16px", alignItems: "center" };
const bigAvatarStyle: React.CSSProperties = { width: "96px", height: "96px", borderRadius: "0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "36px", color: "#fff", background: "linear-gradient(135deg, var(--cobalt), var(--cobalt))", overflow: "hidden", flexShrink: 0 };
const infoTableStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--line)", paddingTop: "16px" };
const infoRowStyle: React.CSSProperties   = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" };
const labelStyle: React.CSSProperties     = { color: "var(--ink-soft)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };
const valueStyle: React.CSSProperties     = { color: "var(--ink)", fontSize: "0.85rem", textAlign: "right", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const ghostLink: React.CSSProperties      = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "0.82rem", textDecoration: "none", borderRadius: "0", border: "1px solid var(--line)", color: "var(--cobalt-accent)", background: "color-mix(in srgb, var(--card) 80%, transparent)" };
const secondaryBtn   = { padding: "8px 16px", borderRadius: "0", border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: "0.82rem", cursor: "pointer" };
const loadingStyle: React.CSSProperties   = { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--ink-faint)", fontSize: "0.9rem", background: "var(--card)" };