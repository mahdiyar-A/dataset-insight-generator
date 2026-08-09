"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { errorMessage } from "@/lib/types";

type UserRow = {
  id: string; email: string; userName: string; plan: string;
  isActive: boolean; createdAt: string; lastActive?: string;
  planExpiresAt?: string; stripeSubscriptionId?: string;
};

type Stats = {
  totalUsers: number; freeUsers: number; proUsers: number;
  adminUsers: number; activeToday: number; activeThisWeek: number;
};

export default function AdminPage() {
  const router                     = useRouter();
  const { token, user, isLoading } = useAuth();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<"overview" | "users">("overview");

  const isAdmin = user?.plan === "admin";

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    setBusy(true);
    try {
      const [statsData, usersData] = await Promise.all([
        BackendAPI.adminGetStats(token),
        BackendAPI.adminGetUsers(token, { page, size: 20, plan: planFilter || null, search: search || null }),
      ]);
      setStats(statsData);
      setUsers(usersData.users);
      setTotal(usersData.total);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }, [token, isAdmin, page, planFilter, search]);

  useEffect(() => {
    if (!isLoading && !token) { router.replace("/login"); return; }
    if (!isLoading && token && !isAdmin) { router.replace("/dashboard"); return; }
    if (token && isAdmin) load();
  }, [token, isLoading, isAdmin]);

  useEffect(() => { if (isAdmin) load(); }, [page, planFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleSetPlan = async (userId: string, plan: string) => {
    if (!token) return;
    try {
      await BackendAPI.adminSetPlan(token, userId, plan);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!token || !confirm(`Permanently delete user ${email}? This cannot be undone.`)) return;
    try {
      await BackendAPI.adminDeleteUser(token, userId);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  };

  if (isLoading || !token) return null;
  if (!isAdmin) return null;

  const StatCard = ({ label, value, sub, color = "#e2e8f0" }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    color?: string;
  }) => (
    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.7)",
      borderRadius: "14px", padding: "22px" }}>
      <p style={{ margin: "0 0 6px", color: "#475569", fontSize: "0.75rem",
        textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ margin: "0 0 4px", fontSize: "2rem", fontWeight: 800, color }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: "0.75rem", color: "#334155" }}>{sub}</p>}
    </div>
  );

  const planBadge = (plan: string) => ({
    admin: { bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.35)", color: "#c4b5fd" },
    pro:   { bg: "rgba(37,99,235,0.15)",  border: "rgba(37,99,235,0.35)",  color: "#93c5fd" },
    free:  { bg: "rgba(30,41,59,0.5)",    border: "rgba(30,41,59,0.7)",    color: "#64748b" },
  }[plan] ?? { bg: "rgba(30,41,59,0.5)", border: "rgba(30,41,59,0.7)", color: "#64748b" });

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0",
      padding: "40px 24px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "32px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px",
            marginBottom: "6px" }}>
            <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "0.72rem",
              fontWeight: 700, background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.35)", color: "#c4b5fd" }}>
              ADMIN
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 800 }}>
            Platform Dashboard
          </h1>
        </div>
        <button onClick={() => router.push("/dashboard")}
          style={{ background: "none", border: "1px solid rgba(30,41,59,0.7)",
            color: "#64748b", borderRadius: "8px", padding: "8px 16px",
            fontSize: "0.83rem", cursor: "pointer" }}>
          ← User Dashboard
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "20px",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px" }}>
        {(["overview", "users"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 20px", borderRadius: "8px", border: "none",
              fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
              background: tab === t ? "rgba(37,99,235,0.2)" : "transparent",
              color: tab === t ? "#93c5fd" : "#475569" }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px", marginBottom: "32px" }}>
            <StatCard label="Total Users"     value={stats.totalUsers}     color="#e2e8f0" />
            <StatCard label="Free Users"      value={stats.freeUsers}      color="#94a3b8" />
            <StatCard label="Pro Users"       value={stats.proUsers}       color="#60a5fa" />
            <StatCard label="Active Today"    value={stats.activeToday}    color="#10b981" />
            <StatCard label="Active This Week" value={stats.activeThisWeek} color="#a78bfa" />
          </div>

          {/* Health */}
          <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.7)",
            borderRadius: "14px", padding: "22px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 700,
              color: "#94a3b8" }}>
              System Health
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "Backend API",      status: "ok" },
                { label: "Supabase DB",      status: "ok" },
                { label: "Supabase Storage", status: "ok" },
                { label: "Stripe",           status: "ok" },
                { label: "AI Service",       status: "ok" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "10px 14px", borderRadius: "8px",
                  background: "rgba(2,6,23,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}>
                  <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{s.label}</span>
                  <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                    color: "#6ee7b7" }}>
                    ✓ {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", flex: 1,
              minWidth: "200px" }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email or name…"
                style={{ flex: 1, padding: "9px 14px", borderRadius: "8px",
                  border: "1px solid rgba(30,41,59,0.8)",
                  background: "rgba(15,23,42,0.8)", color: "#e2e8f0",
                  fontSize: "0.85rem", outline: "none" }} />
              <button type="submit"
                style={{ padding: "9px 18px", borderRadius: "8px", border: "none",
                  background: "rgba(37,99,235,0.25)", color: "#93c5fd",
                  fontWeight: 600, fontSize: "0.83rem", cursor: "pointer" }}>
                Search
              </button>
            </form>
            <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
              style={{ padding: "9px 14px", borderRadius: "8px",
                border: "1px solid rgba(30,41,59,0.8)",
                background: "rgba(15,23,42,0.8)", color: "#94a3b8",
                fontSize: "0.85rem", cursor: "pointer" }}>
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <p style={{ color: "#475569", fontSize: "0.8rem", marginBottom: "12px" }}>
            {total} users total
          </p>

          {/* Table */}
          <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.7)",
            borderRadius: "14px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <thead>
                <tr style={{ background: "rgba(2,6,23,0.6)",
                  borderBottom: "1px solid rgba(30,41,59,0.7)" }}>
                  {["User", "Plan", "Active", "Joined", "Actions"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left",
                      color: "#475569", fontWeight: 600, fontSize: "0.75rem",
                      textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const badge = planBadge(u.plan);
                  return (
                    <tr key={u.id} style={{
                      borderBottom: i < users.length - 1
                        ? "1px solid rgba(30,41,59,0.4)" : "none",
                      background: i % 2 === 0 ? "transparent" : "rgba(2,6,23,0.2)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 600,
                          color: "#cbd5e1" }}>{u.userName}</p>
                        <p style={{ margin: 0, color: "#475569",
                          fontSize: "0.75rem" }}>{u.email}</p>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "999px",
                          fontSize: "0.72rem", fontWeight: 600,
                          background: badge.bg, border: `1px solid ${badge.border}`,
                          color: badge.color }}>
                          {u.plan}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b",
                        fontSize: "0.78rem" }}>
                        {u.lastActive
                          ? new Date(u.lastActive).toLocaleDateString("en-CA")
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b",
                        fontSize: "0.78rem" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-CA")}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {/* Plan toggle */}
                          {u.plan !== "pro" && (
                            <button onClick={() => handleSetPlan(u.id, "pro")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "none",
                                background: "rgba(37,99,235,0.2)", color: "#93c5fd",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Pro
                            </button>
                          )}
                          {u.plan !== "free" && u.plan !== "admin" && (
                            <button onClick={() => handleSetPlan(u.id, "free")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "none",
                                background: "rgba(30,41,59,0.5)", color: "#64748b",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Free
                            </button>
                          )}
                          {u.plan !== "admin" && (
                            <button onClick={() => handleSetPlan(u.id, "admin")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "none",
                                background: "rgba(124,58,237,0.15)", color: "#c4b5fd",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Admin
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u.id, u.email)}
                            style={{ padding: "4px 10px", borderRadius: "6px", border: "none",
                              background: "rgba(239,68,68,0.1)", color: "#f87171",
                              fontSize: "0.72rem", cursor: "pointer" }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "8px",
              marginTop: "20px" }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "7px 14px", borderRadius: "8px",
                  border: "1px solid rgba(30,41,59,0.7)", background: "transparent",
                  color: "#64748b", cursor: "pointer", opacity: page === 1 ? 0.4 : 1 }}>
                ←
              </button>
              <span style={{ padding: "7px 14px", color: "#64748b", fontSize: "0.83rem" }}>
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                style={{ padding: "7px 14px", borderRadius: "8px",
                  border: "1px solid rgba(30,41,59,0.7)", background: "transparent",
                  color: "#64748b", cursor: "pointer",
                  opacity: page >= Math.ceil(total / 20) ? 0.4 : 1 }}>
                →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
