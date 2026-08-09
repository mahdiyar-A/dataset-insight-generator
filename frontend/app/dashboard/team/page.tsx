"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { errorMessage } from "@/lib/types";

type Team   = { id: string; name: string; ownerId: string; inviteCode: string; isOwner: boolean };
type Member = { userId: string; role: string; userName?: string; email?: string; plan?: string };
type Invite = { id: string; email: string; role: string; createdAt: string; isPending: boolean };

export default function TeamPage() {
  const router                    = useRouter();
  const { token, user, isLoading } = useAuth();

  const [teams,      setTeams]      = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [invites,    setInvites]    = useState<Invite[]>([]);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState("viewer");
  const [tab,        setTab]        = useState<"members" | "invites">("members");

  const isPro = user?.plan === "pro" || user?.plan === "admin";

  const loadTeams = useCallback(async () => {
    if (!token) return;
    try {
      const data = await BackendAPI.getMyTeams(token);
      setTeams(data);
      if (data.length > 0 && !activeTeam) setActiveTeam(data[0]);
    } catch (e) { setError(errorMessage(e)); }
  }, [token]);

  const loadTeamDetail = useCallback(async (team: Team) => {
    if (!token) return;
    try {
      const [m, i] = await Promise.all([
        BackendAPI.getTeamMembers(token, team.id),
        BackendAPI.getPendingInvites(token, team.id),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (e) { setError(errorMessage(e)); }
  }, [token]);

  useEffect(() => {
    if (!isLoading && !token) { router.replace("/login"); return; }
    if (token) loadTeams();
  }, [token, isLoading]);

  useEffect(() => {
    if (activeTeam) loadTeamDetail(activeTeam);
  }, [activeTeam]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !token) return;
    setBusy(true); setError("");
    try {
      const team = await BackendAPI.createTeam(token, newTeamName.trim());
      setNewTeamName("");
      await loadTeams();
      setActiveTeam(team);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeTeam || !token) return;
    setBusy(true); setError("");
    try {
      await BackendAPI.inviteMember(token, activeTeam.id, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await loadTeamDetail(activeTeam);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeTeam || !token) return;
    if (!confirm("Remove this member from the team?")) return;
    try {
      await BackendAPI.removeMember(token, activeTeam.id, memberId);
      await loadTeamDetail(activeTeam);
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeTeam || !token) return;
    try {
      await BackendAPI.revokeInvite(token, activeTeam.id, inviteId);
      await loadTeamDetail(activeTeam);
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleDeleteTeam = async () => {
    if (!activeTeam || !token) return;
    if (!confirm(`Delete team "${activeTeam.name}"? This cannot be undone.`)) return;
    try {
      await BackendAPI.deleteTeam(token, activeTeam.id);
      setActiveTeam(null);
      await loadTeams();
    } catch (e) { setError(errorMessage(e)); }
  };

  if (isLoading || !token) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0",
      padding: "40px 24px", maxWidth: "900px", margin: "0 auto" }}>

      <button onClick={() => router.push("/dashboard")}
        style={{ background: "none", border: "none", color: "#64748b",
          fontSize: "0.85rem", cursor: "pointer", marginBottom: "28px" }}>
        ← Back to Dashboard
      </button>

      <h1 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "4px" }}>
        Collaboration Teams
      </h1>
      <p style={{ color: "#64748b", marginBottom: "32px", fontSize: "0.88rem" }}>
        Create a team, invite Pro members, and share analyses for real-time collaboration.
      </p>

      {!isPro && (
        <div style={{ padding: "16px 20px", borderRadius: "12px", marginBottom: "24px",
          background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
          <p style={{ margin: 0, color: "#fde68a", fontSize: "0.88rem" }}>
            ⚡ Team collaboration requires a Pro plan.{" "}
            <button onClick={() => router.push("/plans")}
              style={{ background: "none", border: "none", color: "#60a5fa",
                cursor: "pointer", fontWeight: 600, padding: 0 }}>
              Upgrade →
            </button>
          </p>
        </div>
      )}

      {error && (
        <p style={{ color: "#f87171", background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px",
          padding: "10px 14px", fontSize: "0.85rem", marginBottom: "16px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px",
        alignItems: "start" }}>

        {/* Team list sidebar */}
        <div>
          <p style={{ color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase",
            letterSpacing: "0.06em", marginBottom: "10px" }}>
            Your teams
          </p>

          {teams.map(t => (
            <button key={t.id}
              onClick={() => setActiveTeam(t)}
              style={{ width: "100%", textAlign: "left", padding: "10px 14px",
                borderRadius: "10px", border: "none", cursor: "pointer", marginBottom: "6px",
                background: activeTeam?.id === t.id
                  ? "rgba(37,99,235,0.15)" : "rgba(15,23,42,0.6)",
                color: activeTeam?.id === t.id ? "#93c5fd" : "#94a3b8",
                fontWeight: activeTeam?.id === t.id ? 600 : 400 }}>
              {t.name}
              {t.isOwner && <span style={{ marginLeft: "6px", fontSize: "0.7rem",
                color: "#475569" }}>owner</span>}
            </button>
          ))}

          {isPro && (
            <div style={{ marginTop: "16px" }}>
              <input
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
                placeholder="New team name…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px",
                  background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.8)",
                  color: "#e2e8f0", fontSize: "0.83rem", outline: "none",
                  boxSizing: "border-box" }} />
              <button
                onClick={handleCreateTeam}
                disabled={busy || !newTeamName.trim()}
                style={{ width: "100%", marginTop: "8px", padding: "9px",
                  borderRadius: "8px", border: "none",
                  background: "rgba(37,99,235,0.3)", color: "#93c5fd",
                  fontWeight: 600, fontSize: "0.83rem", cursor: "pointer",
                  opacity: busy || !newTeamName.trim() ? 0.5 : 1 }}>
                + Create team
              </button>
            </div>
          )}
        </div>

        {/* Team detail */}
        {activeTeam ? (
          <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "16px", padding: "28px" }}>

            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 700 }}>
                  {activeTeam.name}
                </h2>
                <p style={{ margin: 0, color: "#475569", fontSize: "0.78rem" }}>
                  Invite code: <code style={{ color: "#60a5fa",
                    background: "rgba(37,99,235,0.1)", padding: "2px 6px",
                    borderRadius: "4px" }}>{activeTeam.inviteCode}</code>
                </p>
              </div>
              {activeTeam.isOwner && (
                <button onClick={handleDeleteTeam}
                  style={{ background: "none", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#f87171", borderRadius: "8px", padding: "6px 12px",
                    fontSize: "0.78rem", cursor: "pointer" }}>
                  Delete team
                </button>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
              {(["members", "invites"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: "7px 16px", borderRadius: "8px", border: "none",
                    fontWeight: 600, fontSize: "0.83rem", cursor: "pointer",
                    background: tab === t ? "rgba(37,99,235,0.2)" : "transparent",
                    color: tab === t ? "#93c5fd" : "#475569" }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Members list */}
            {tab === "members" && (
              <div>
                {members.map(m => (
                  <div key={m.userId} style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "10px 14px", borderRadius: "10px",
                    background: "rgba(2,6,23,0.4)", marginBottom: "8px",
                    border: "1px solid rgba(30,41,59,0.5)" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "0.88rem" }}>
                        {m.userName || m.email || m.userId}
                      </p>
                      <p style={{ margin: 0, color: "#475569", fontSize: "0.75rem" }}>
                        {m.email} · {m.plan ?? "free"} plan
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: "999px",
                        background: m.role === "owner"
                          ? "rgba(124,58,237,0.15)" : "rgba(30,41,59,0.6)",
                        border: m.role === "owner"
                          ? "1px solid rgba(124,58,237,0.35)" : "1px solid rgba(30,41,59,0.8)",
                        color: m.role === "owner" ? "#c4b5fd" : "#64748b",
                        fontSize: "0.72rem", fontWeight: 600 }}>
                        {m.role}
                      </span>
                      {activeTeam.isOwner && m.role !== "owner" && (
                        <button onClick={() => handleRemoveMember(m.userId)}
                          style={{ background: "none", border: "none",
                            color: "#f87171", cursor: "pointer", fontSize: "0.78rem" }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Invite form */}
                {isPro && activeTeam.isOwner && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "16px",
                    flexWrap: "wrap" }}>
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="Email address…"
                      style={{ flex: "1 1 200px", padding: "10px 14px",
                        borderRadius: "8px", border: "1px solid rgba(30,41,59,0.8)",
                        background: "rgba(2,6,23,0.6)", color: "#e2e8f0",
                        fontSize: "0.85rem", outline: "none" }} />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: "8px",
                        border: "1px solid rgba(30,41,59,0.8)",
                        background: "rgba(2,6,23,0.6)", color: "#94a3b8",
                        fontSize: "0.85rem", cursor: "pointer" }}>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button onClick={handleInvite} disabled={busy || !inviteEmail.trim()}
                      style={{ padding: "10px 20px", borderRadius: "8px", border: "none",
                        background: "rgba(37,99,235,0.3)", color: "#93c5fd",
                        fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                        opacity: busy || !inviteEmail.trim() ? 0.5 : 1 }}>
                      Send invite
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Pending invites list */}
            {tab === "invites" && (
              <div>
                {invites.length === 0 ? (
                  <p style={{ color: "#475569", fontSize: "0.85rem" }}>No pending invitations.</p>
                ) : invites.map(inv => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "10px 14px", borderRadius: "10px",
                    background: "rgba(2,6,23,0.4)", marginBottom: "8px",
                    border: "1px solid rgba(30,41,59,0.5)" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: "0.88rem" }}>{inv.email}</p>
                      <p style={{ margin: 0, color: "#475569", fontSize: "0.75rem" }}>
                        Role: {inv.role} · Sent {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {activeTeam.isOwner && (
                      <button onClick={() => handleRevokeInvite(inv.id)}
                        style={{ background: "none", border: "none",
                          color: "#f87171", cursor: "pointer", fontSize: "0.78rem" }}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "200px", color: "#334155", fontSize: "0.88rem" }}>
            {isPro ? "Create or select a team to get started" : "Upgrade to Pro to use teams"}
          </div>
        )}
      </div>
    </div>
  );
}
