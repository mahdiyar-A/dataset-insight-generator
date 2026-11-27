"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import AdminModels from "@/components/AdminModels";
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

type Analytics = {
  windowDays: number;
  totals: {
    analyses: number; failed: number; successRate: number;
    totalCostUsd: number; avgCostUsd: number; costedRuns: number;
    tokensIn: number; tokensOut: number;
  };
  users: {
    total: number; free: number; pro: number;
    activeAnalysts: number; activeThisWeek: number; estimatedMrrUsd: number;
    paying?: number;
  };
  perDay: { date: string; analyses: number; failed: number; costUsd: number }[];
};

type HealthCheck = { name: string; ok: boolean; ms: number; note?: string | null };

type Visits = {
  windowDays: number;
  today: { views: number; visitors: number };
  week:  { views: number; visitors: number };
  total: { views: number; visitors: number };
  perDay: { date: string; views: number; visitors: number }[];
  topPages: { path: string; views: number; visitors: number }[];
  topSources: { source: string; views: number }[];
};

// How often the open page refreshes its numbers, while the tab is in view.
const LIVE_EVERY_MS = 15_000;

/**
 * One measure per chart, deliberately: analyses/day and cost/day differ in
 * scale, and a dual-axis chart invites reading a relationship the axes
 * fabricate. Two aligned single-series charts carry the same comparison
 * honestly.
 */
function DayBarChart<T extends { date: string }>({ title, days, value, format, barColor }: {
  title: string;
  days: T[];
  value: (d: T) => number;
  format: (v: number) => string;
  barColor: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // The real highest day. A floor of 1 here used to print "peak $1.000" on a
  // month that cost a fraction of a cent; the floor is only for bar heights.
  const peak = days.length ? Math.max(...days.map(value)) : 0;
  const max  = peak > 0 ? peak : 1;
  const W = 600, H = 140, PAD = 4;
  const bw = (W - PAD * 2) / days.length;

  return (
    <div style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)",
      border: "1px solid var(--line)", borderRadius: "0",
      padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700,
          color: "var(--ink-soft)" }}>{title}</h3>
        <span style={{ fontSize: "0.75rem", color: "var(--ink-faint)", minHeight: "1em" }}>
          {hover != null
            ? `${days[hover].date} — ${format(value(days[hover]))}`
            : peak > 0 ? `peak ${format(peak)}` : "nothing yet"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHover(null)}>
        {/* Baseline */}
        <line x1={PAD} x2={W - PAD} y1={H - 1} y2={H - 1}
          stroke="rgba(30,41,59,0.9)" strokeWidth="1" />
        {days.map((d, i) => {
          const v = value(d);
          const h = v <= 0 ? 0 : Math.max((v / max) * (H - 14), 2);
          const x = PAD + i * bw;
          return (
            <g key={d.date}
              onMouseEnter={() => setHover(i)}>
              {/* Hit target spans the full column height, not just the bar */}
              <rect x={x} y={0} width={bw} height={H}
                fill={hover === i ? "rgba(148,163,184,0.06)" : "transparent"} />
              {h > 0 && (
                <rect
                  x={x + bw * 0.18} width={bw * 0.64}
                  y={H - 1 - h} height={h}
                  rx={Math.min(3, bw * 0.3)}
                  fill={barColor}
                  opacity={hover === null || hover === i ? 0.9 : 0.35}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between",
        marginTop: "6px", fontSize: "0.68rem", color: "var(--ink-faint)" }}>
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

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
  const [tab,     setTab]     = useState<"overview" | "analytics" | "visits" | "models" | "users">("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [health,  setHealth]  = useState<HealthCheck[] | null>(null);
  const [visits,  setVisits]  = useState<Visits | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

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

  // The numbers on the open tab refresh every 15 seconds while the page is in
  // view, so a new sign-up or a service going down shows without a reload.
  useEffect(() => {
    if (!token || !isAdmin || (tab !== "overview" && tab !== "visits")) return;
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (tab === "overview") {
          const [s, h] = await Promise.all([
            BackendAPI.adminGetStats(token),
            BackendAPI.adminGetHealth(token).then(r => r.checks as HealthCheck[]).catch(() => null),
          ]);
          if (stopped) return;
          setStats(s);
          setHealth(h);
        } else {
          const v = await BackendAPI.adminGetVisits(token, 30);
          if (stopped) return;
          setVisits(v);
        }
        setUpdatedAt(Date.now());
      } catch (e) { if (!stopped) setError(errorMessage(e)); }
    };
    refresh();
    const every = setInterval(refresh, LIVE_EVERY_MS);
    const ticker = setInterval(() => setTick(t => t + 1), 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearInterval(every);
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tab, token, isAdmin]);

  // Fetched on first visit to the tab rather than with the page: it scans the
  // whole analytics window server-side, which the other tabs never need.
  useEffect(() => {
    if (tab !== "analytics" || !token || !isAdmin || analytics) return;
    BackendAPI.adminGetAnalytics(token, 30)
      .then(setAnalytics)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [tab, token, isAdmin, analytics]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleSetPlan = async (u: UserRow, plan: string) => {
    if (!token) return;
    // A paying customer moved to Free has their Stripe subscription cancelled.
    const paying = plan === "free" && !!u.stripeSubscriptionId;
    if (paying && !confirm(
      `${u.email} pays for Pro through Stripe. Moving them to Free cancels their subscription. Continue?`)) return;
    setError("");
    try {
      await BackendAPI.adminSetPlan(token, u.id, plan, null, paying);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!token || !confirm(`Permanently delete user ${email}? This cannot be undone.`)) return;
    setError("");
    try {
      await BackendAPI.adminDeleteUser(token, userId);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  };

  if (isLoading || !token) return null;
  if (!isAdmin) return null;

  const StatCard = ({ label, value, sub, color = "var(--ink)" }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    color?: string;
  }) => (
    <div style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)", border: "1px solid var(--line)",
      borderRadius: "0", padding: "22px" }}>
      <p style={{ margin: "0 0 6px", color: "var(--ink-faint)", fontSize: "0.75rem",
        textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ margin: "0 0 4px", fontSize: "2rem", fontWeight: 800, color }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--ink-faint)" }}>{sub}</p>}
    </div>
  );

  const planBadge = (plan: string) => ({
    admin: { bg: "color-mix(in srgb, var(--cobalt) 15%, transparent)", border: "color-mix(in srgb, var(--cobalt) 35%, transparent)", color: "var(--cobalt-accent)" },
    pro:   { bg: "color-mix(in srgb, var(--cobalt) 15%, transparent)",  border: "color-mix(in srgb, var(--cobalt) 35%, transparent)",  color: "var(--cobalt-accent)" },
    free:  { bg: "color-mix(in srgb, var(--card) 50%, transparent)",    border: "var(--line)",    color: "var(--ink-faint)" },
  }[plan] ?? { bg: "color-mix(in srgb, var(--card) 50%, transparent)", border: "var(--line)", color: "var(--ink-faint)" });

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)",
      padding: "40px clamp(14px, 4vw, 24px)", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "14px",
        alignItems: "center", marginBottom: "32px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px",
            marginBottom: "6px" }}>
            <span style={{ padding: "3px 10px", borderRadius: "0", fontSize: "0.72rem",
              fontWeight: 700, background: "color-mix(in srgb, var(--cobalt) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--cobalt) 35%, transparent)", color: "var(--cobalt-accent)" }}>
              ADMIN
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 800 }}>
            Platform Dashboard
          </h1>
        </div>
        <button onClick={() => router.push("/dashboard")}
          style={{ background: "none", border: "1px solid var(--line)",
            color: "var(--ink-faint)", borderRadius: "0", padding: "8px 16px",
            fontSize: "0.83rem", cursor: "pointer" }}>
          ← User Dashboard
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: "0", marginBottom: "20px",
          background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
          color: "var(--danger-text)", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: updatedAt && (tab === "overview" || tab === "visits") ? "8px" : "28px",
        overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {(["overview", "analytics", "visits", "models", "users"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 20px", borderRadius: "0", border: "none", flex: "0 0 auto",
              fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
              background: tab === t ? "color-mix(in srgb, var(--cobalt) 20%, transparent)" : "transparent",
              color: tab === t ? "var(--cobalt-accent)" : "var(--ink-faint)" }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {updatedAt && (tab === "overview" || tab === "visits") && (
        <p style={{ margin: "0 0 20px", fontSize: "0.72rem", color: "var(--ink-faint)" }}>
          Updated {Math.max(0, Math.round((Date.now() - updatedAt) / 1000))}s ago · refreshes every 15 seconds
        </p>
      )}

      {/* Overview */}
      {tab === "overview" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px", marginBottom: "32px" }}>
            <StatCard label="Total Users"     value={stats.totalUsers}     color="var(--ink)" />
            <StatCard label="Free Users"      value={stats.freeUsers}      color="var(--ink-soft)" />
            <StatCard label="Pro Users"       value={stats.proUsers}       color="var(--cobalt-accent)" />
            <StatCard label="Active Today"    value={stats.activeToday}    color="var(--ok-text)" />
            <StatCard label="Active This Week" value={stats.activeThisWeek} color="var(--cobalt-accent)" />
          </div>

          {/* Health */}
          <div style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)", border: "1px solid var(--line)",
            borderRadius: "0", padding: "22px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 700,
              color: "var(--ink-soft)" }}>
              System Health
            </h3>
            {/* Each service is really tried by the server, each time. */}
            {!health ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-faint)" }}>Checking…</p>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {health.map(s => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
                  alignItems: "center", padding: "10px 14px", borderRadius: "0",
                  background: "color-mix(in srgb, var(--card) 50%, transparent)", border: "1px solid var(--line)" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    {s.name}
                    {s.note && (
                      <span style={{ display: "block", fontSize: "0.72rem",
                        color: s.ok ? "var(--ink-faint)" : "var(--danger-text)" }}>{s.note}</span>
                    )}
                  </span>
                  <span style={{ padding: "3px 10px", borderRadius: "0", fontSize: "0.72rem",
                    fontWeight: 600,
                    background: s.ok ? "color-mix(in srgb, var(--ok) 10%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
                    border: s.ok ? "1px solid color-mix(in srgb, var(--ok) 35%, transparent)" : "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                    color: s.ok ? "var(--ok-text)" : "var(--danger-text)" }}>
                    {s.ok ? `✓ ok · ${s.ms} ms` : "✕ down"}
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics */}
      {tab === "analytics" && (
        !analytics ? (
          <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>Loading analytics…</p>
        ) : (
          <div>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", margin: "0 0 16px" }}>
              Last {analytics.windowDays} days
            </p>

            <div style={{ display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "16px", marginBottom: "32px" }}>
              <StatCard label="Analyses" value={analytics.totals.analyses}
                sub={`${analytics.totals.failed} failed`} color="var(--ink)" />
              <StatCard label="Success Rate"
                value={`${Math.round(analytics.totals.successRate * 100)}%`}
                color="var(--ok-text)" />
              <StatCard label="LLM Cost"
                value={`$${analytics.totals.totalCostUsd.toFixed(2)}`}
                sub={`${analytics.totals.costedRuns} runs recorded cost`}
                color="var(--cobalt-accent)" />
              <StatCard label="Avg Cost / Analysis"
                value={`$${analytics.totals.avgCostUsd.toFixed(4)}`}
                sub={`${(analytics.totals.tokensIn / 1000).toFixed(0)}k in / ${(analytics.totals.tokensOut / 1000).toFixed(0)}k out tokens`}
                color="var(--cobalt-accent)" />
              <StatCard label="Active Analysts"
                value={analytics.users.activeAnalysts}
                sub={`of ${analytics.users.total} users`} color="var(--cobalt-accent)" />
              <StatCard label="Est. MRR"
                value={`$${analytics.users.estimatedMrrUsd.toFixed(2)}`}
                sub={`${analytics.users.paying ?? analytics.users.pro} paying × $9.99 — see Stripe for net`}
                color="var(--ok-text)" />
            </div>

            <div style={{ display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px", marginBottom: "24px" }}>
              <DayBarChart
                title="Analyses per day"
                days={analytics.perDay}
                value={d => d.analyses}
                format={v => `${v}`}
                barColor="var(--cobalt-accent)"
              />
              <DayBarChart
                title="LLM cost per day (USD)"
                days={analytics.perDay}
                value={d => d.costUsd}
                format={v => `$${v.toFixed(3)}`}
                barColor="var(--cobalt-accent)"
              />
            </div>

            {/* Same numbers as a table — for screen readers, and for anyone
                who wants the exact values rather than bar heights. */}
            <details style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)",
              border: "1px solid var(--line)", borderRadius: "0",
              padding: "16px 22px" }}>
              <summary style={{ cursor: "pointer", color: "var(--ink-soft)",
                fontSize: "0.85rem", fontWeight: 600 }}>
                Daily numbers as a table
              </summary>
              <div style={{ overflowX: "auto", marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse",
                  fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      {["Date", "Analyses", "Failed", "Cost (USD)"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                          color: "var(--ink-faint)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.perDay.map(d => (
                      <tr key={d.date}
                        style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 12px", color: "var(--ink-faint)" }}>{d.date}</td>
                        <td style={{ padding: "6px 12px", color: "var(--ink)" }}>{d.analyses}</td>
                        <td style={{ padding: "6px 12px",
                          color: d.failed > 0 ? "var(--danger-text)" : "var(--ink-faint)" }}>{d.failed}</td>
                        <td style={{ padding: "6px 12px", color: "var(--ink)" }}>
                          ${d.costUsd.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )
      )}

      {/* Visits, counted on our own server without cookies */}
      {tab === "visits" && (
        !visits ? (
          <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>Loading visits…</p>
        ) : (
          <div>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", margin: "0 0 16px" }}>
              Last {visits.windowDays} days · counted without cookies; a visitor is told apart only within one day
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "16px", marginBottom: "24px" }}>
              <StatCard label="Visitors today" value={visits.today.visitors}
                sub={`${visits.today.views} page views`} />
              <StatCard label="Visitors, 7 days" value={visits.week.visitors}
                sub={`${visits.week.views} page views`} color="var(--cobalt-accent)" />
              <StatCard label={`Visitors, ${visits.windowDays} days`} value={visits.total.visitors}
                sub={`${visits.total.views} page views`} color="var(--cobalt-accent)" />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <DayBarChart title="Visitors per day" days={visits.perDay}
                value={d => d.visitors} format={v => `${v}`} barColor="var(--cobalt-accent)" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {[
                { title: "Top pages", rows: visits.topPages.map(p => ({ key: p.path, label: p.path, views: p.views })) },
                { title: "Where visitors came from", rows: visits.topSources.map(s => ({ key: s.source, label: s.source, views: s.views })) },
              ].map(block => (
                <div key={block.title} style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)",
                  border: "1px solid var(--line)", padding: "18px 22px" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)" }}>
                    {block.title}
                  </h3>
                  {block.rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-faint)" }}>Nothing yet.</p>
                  ) : block.rows.map(r => (
                    <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: "12px",
                      padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: "0.8rem" }}>
                      <span style={{ color: "var(--ink)", overflowWrap: "anywhere" }}>{r.label}</span>
                      <span style={{ color: "var(--ink-faint)", flex: "0 0 auto" }}>{r.views} views</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* The AI models, and the alarm that watches them */}
      {tab === "models" && token && <AdminModels token={token} />}

      {/* Users */}
      {tab === "users" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", flex: "1 1 260px",
              minWidth: 0 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email or name…"
                style={{ flex: 1, minWidth: 0, padding: "9px 14px", borderRadius: "0",
                  border: "1px solid var(--line)",
                  background: "color-mix(in srgb, var(--card) 80%, transparent)", color: "var(--ink)",
                  fontSize: "0.85rem", outline: "none" }} />
              <button type="submit"
                style={{ padding: "9px 18px", borderRadius: "0", border: "none",
                  background: "color-mix(in srgb, var(--cobalt) 25%, transparent)", color: "var(--cobalt-accent)",
                  fontWeight: 600, fontSize: "0.83rem", cursor: "pointer" }}>
                Search
              </button>
            </form>
            <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
              style={{ flex: "0 0 auto", padding: "9px 14px", borderRadius: "0",
                border: "1px solid var(--line)",
                background: "color-mix(in srgb, var(--card) 80%, transparent)", color: "var(--ink-soft)",
                fontSize: "0.85rem", cursor: "pointer" }}>
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", marginBottom: "12px" }}>
            {total} users total
          </p>

          {/* Table */}
          <div style={{ background: "color-mix(in srgb, var(--card) 80%, transparent)", border: "1px solid var(--line)",
            borderRadius: "0", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "640px", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <thead>
                <tr style={{ background: "color-mix(in srgb, var(--card) 60%, transparent)",
                  borderBottom: "1px solid var(--line)" }}>
                  {["User", "Plan", "Active", "Joined", "Actions"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left",
                      color: "var(--ink-faint)", fontWeight: 600, fontSize: "0.75rem",
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
                        ? "1px solid var(--line)" : "none",
                      background: i % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--card) 20%, transparent)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 600,
                          color: "var(--ink)" }}>{u.userName}</p>
                        <p style={{ margin: 0, color: "var(--ink-faint)",
                          fontSize: "0.75rem" }}>{u.email}</p>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "0",
                          fontSize: "0.72rem", fontWeight: 600,
                          background: badge.bg, border: `1px solid ${badge.border}`,
                          color: badge.color }}>
                          {u.plan}
                        </span>
                        {u.stripeSubscriptionId && (
                          <span style={{ display: "block", marginTop: "4px", fontSize: "0.68rem",
                            color: "var(--ok-text)" }}>paying</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--ink-faint)",
                        fontSize: "0.78rem" }}>
                        {u.lastActive
                          ? new Date(u.lastActive).toLocaleDateString("en-CA")
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--ink-faint)",
                        fontSize: "0.78rem" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-CA")}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {/* Plan toggle */}
                          {u.plan !== "pro" && (
                            <button onClick={() => handleSetPlan(u, "pro")}
                              style={{ padding: "4px 10px", borderRadius: "0", border: "none",
                                background: "color-mix(in srgb, var(--cobalt) 20%, transparent)", color: "var(--cobalt-accent)",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Pro
                            </button>
                          )}
                          {u.plan !== "free" && (
                            <button onClick={() => handleSetPlan(u, "free")}
                              style={{ padding: "4px 10px", borderRadius: "0", border: "none",
                                background: "color-mix(in srgb, var(--card) 50%, transparent)", color: "var(--ink-faint)",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Free
                            </button>
                          )}
                          {u.plan !== "admin" && (
                            <button onClick={() => handleSetPlan(u, "admin")}
                              style={{ padding: "4px 10px", borderRadius: "0", border: "none",
                                background: "color-mix(in srgb, var(--cobalt) 15%, transparent)", color: "var(--cobalt-accent)",
                                fontSize: "0.72rem", cursor: "pointer" }}>
                              → Admin
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u.id, u.email)}
                            style={{ padding: "4px 10px", borderRadius: "0", border: "none",
                              background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger-text)",
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
                style={{ padding: "7px 14px", borderRadius: "0",
                  border: "1px solid var(--line)", background: "transparent",
                  color: "var(--ink-faint)", cursor: "pointer", opacity: page === 1 ? 0.4 : 1 }}>
                ←
              </button>
              <span style={{ padding: "7px 14px", color: "var(--ink-faint)", fontSize: "0.83rem" }}>
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                style={{ padding: "7px 14px", borderRadius: "0",
                  border: "1px solid var(--line)", background: "transparent",
                  color: "var(--ink-faint)", cursor: "pointer",
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
