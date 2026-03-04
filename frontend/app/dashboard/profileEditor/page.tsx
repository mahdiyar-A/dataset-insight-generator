// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";

export default function ProfileViewPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();

  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    if (currentUser?.profilePicture) setAvatarUrl(currentUser.profilePicture);
  }, [currentUser]);

  if (isLoading) return <div style={loadingStyle}>Loading…</div>;
  if (!currentUser) return <div style={loadingStyle}>Not authenticated.</div>;

  const initial = (currentUser.username?.charAt(0) ?? "U").toUpperCase();
  const displayName =
    currentUser.username ||
    `${currentUser.firstName ?? ""} ${currentUser.lastName ?? ""}`.trim() ||
    "User";

  const rows = [
    { label: "First name", value: currentUser.firstName || "—" },
    { label: "Last name", value: currentUser.lastName || "—" },
    { label: "Display name", value: currentUser.username || "—" },
    { label: "Phone", value: currentUser.phoneNumber || "—" },
    { label: "Email", value: currentUser.email || "—" },
  ];

  return (
    <div style={pageStyle}>
      <div style={{ padding: "16px 24px 0" }}>
        <a href="/dashboard" style={ghostLink}>← Back to Dashboard</a>
      </div>

      <div style={wrapStyle}>
        <section style={cardStyle}>
          <div style={headerRowStyle}>
            <div style={bigAvatarStyle}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "18px" }}
                />
              ) : (
                initial
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ margin: 0, color: "#e5e7eb", fontSize: "1.05rem", fontWeight: 800 }}>
                {displayName}
              </h2>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                {currentUser.email}
              </p>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "0.8rem" }}>
                View only. To make changes, go to Account Settings.
              </p>
            </div>
          </div>

          <div style={infoTableStyle}>
            {rows.map((row) => (
              <div key={row.label} style={infoRowStyle}>
                <span style={labelStyle}>{row.label}</span>
                <span style={valueStyle}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
            <button
              type="button"
              style={secondaryBtnStyle2}
              onClick={() => router.push("/dashboard/accountSettings")}
            >
              Account Settings →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/* styles */
const pageStyle = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, #020617 0, #020617 45%, #000 100%)",
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#e5e7eb",
};

const wrapStyle = { maxWidth: "920px", margin: "24px auto", padding: "0 24px 48px" };

const cardStyle = {
  background: "rgba(15,23,42,0.95)",
  borderRadius: "18px",
  border: "1px solid rgba(31,41,55,0.8)",
  padding: "22px",
  boxShadow: "0 18px 45px rgba(15,23,42,0.85)",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const headerRowStyle = { display: "flex", gap: "14px", alignItems: "center" };

const bigAvatarStyle = {
  width: "72px",
  height: "72px",
  borderRadius: "18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: "30px",
  color: "#fff",
  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
  overflow: "hidden",
  flexShrink: 0,
};

const infoTableStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  width: "100%",
  borderTop: "1px solid rgba(31,41,55,0.8)",
  paddingTop: "14px",
};

const infoRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const labelStyle = {
  color: "#9ca3af",
  fontSize: "0.78rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const valueStyle = {
  color: "#d1d5db",
  fontSize: "0.86rem",
  textAlign: "right",
  maxWidth: "360px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ghostLink = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 14px",
  fontSize: "0.82rem",
  textDecoration: "none",
  borderRadius: "999px",
  border: "1px solid rgba(148,163,184,0.3)",
  color: "#bfdbfe",
  background: "rgba(15,23,42,0.8)",
};

const secondaryBtnStyle2 = {
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(55,65,81,0.9)",
  background: "rgba(15,23,42,0.95)",
  color: "#e5e7eb",
  fontSize: "0.82rem",
  cursor: "pointer",
};

const loadingStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  color: "#6b7280",
  fontSize: "0.9rem",
  background: "#020617",
};