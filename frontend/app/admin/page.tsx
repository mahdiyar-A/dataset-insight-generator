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

type UsageCounts = Record<string, number>;

type Usage = {
  windowDays: number;
  totals: UsageCounts;
  today: UsageCounts;
  teams: number;
  sharedReports: number;
  perDay: { date: string; questions: number; edits: number; refused: number }[];
  findingsKept: { kind: string; shown: number; removed: number; rewritten: number }[];
};

type AdminAction = {
  at: string; action: string; adminEmail: string;
  targetEmail: string; targetId?: string | null; detail: string;
};

type Actions = { ownerListOn: boolean; actions: AdminAction[] };

// A tab whose data may be missing on the server (migration 007 not run).
type Maybe<T> = { data: T } | { unavailable: string } | null;

const TABS = ["overview", "analytics", "usage", "visits", "models", "users", "activity"] as const;
type Tab = typeof TABS[number];

// How often the open page refreshes its numbers, while the tab is in view.
const LIVE_EVERY_MS = 15_000;

const n = (counts: UsageCounts | undefined, kind: string) => counts?.[kind] ?? 0;

const ACTION_NAMES: Record<string, string> = {
  set_plan: "Changed plan",
  delete_user: "Deleted account",
};

// Kinds of findings, as the report writer names them, in plain words.
const KIND_NAMES: Record<string, string> = {
  trend: "Trend over time", group_difference: "Groups differ", driver: "What drives it",
  segment: "A segment stands out", concentration: "A few make up most",
  repeat_entity: "Repeat customers/items", group_effect: "Group effect",
  correlation: "Two measures move together", association: "Two categories go together",
  derived: "Calculated measure", missing_pattern: "Missing data", anomalies: "Unusual values",
  measure: "One measure", category: "One category", misleading: "Misleading total",
  requested: "What they asked for",
};

function StatCard({ label, value, sub, red = false }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  red?: boolean;
}) {
  return (
    <div className="admin-stat">
      <p className="admin-stat-label">{label}</p>
      <p className={red ? "admin-stat-value red" : "admin-stat-value"}>{value}</p>
      {sub != null && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

/**
 * One measure per chart, deliberately: analyses/day and cost/day differ in
 * scale, and a dual-axis chart invites reading a relationship the axes
 * fabricate. Two aligned single-series charts carry the same comparison
 * honestly.
 */
function DayBarChart<T extends { date: string }>({ title, days, value, format }: {
  title: string;
  days: T[];
  value: (d: T) => number;
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // The real highest day. A floor of 1 here used to print "peak $1.000" on a
  // month that cost a fraction of a cent; the floor is only for bar heights.
  const peak = days.length ? Math.max(...days.map(value)) : 0;
  const max  = peak > 0 ? peak : 1;
  const W = 600, H = 140, PAD = 4;
  const bw = (W - PAD * 2) / Math.max(days.length, 1);

  return (
    <div className="admin-panel">
      <div className="admin-chart-head">
        <h3>{title}</h3>
        <span>
          {hover != null && days[hover]
            ? `${days[hover].date} — ${format(value(days[hover]))}`
            : peak > 0 ? `peak ${format(peak)}` : "nothing yet"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHover(null)}>
        <line x1={PAD} x2={W - PAD} y1={H - 1} y2={H - 1} stroke="var(--rule)" strokeWidth="2" />
        {days.map((d, i) => {
          const v = value(d);
          const h = v <= 0 ? 0 : Math.max((v / max) * (H - 14), 2);
          const x = PAD + i * bw;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              {/* Hit target spans the full column height, not just the bar */}
              <rect x={x} y={0} width={bw} height={H}
                fill={hover === i ? "color-mix(in srgb, var(--lime) 30%, transparent)" : "transparent"} />
              {h > 0 && (
                <rect x={x + bw * 0.18} width={bw * 0.64} y={H - 1 - h} height={h}
                  fill="var(--cobalt-accent)"
                  opacity={hover === null || hover === i ? 1 : 0.4} />
              )}
            </g>
          );
        })}
      </svg>

      <div className="admin-chart-ends">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="atlas-notice warn" role="status">
      <span>{message}</span>
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
  const [tab,     setTab]     = useState<Tab>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [health,  setHealth]  = useState<HealthCheck[] | null>(null);
  const [visits,  setVisits]  = useState<Visits | null>(null);
  const [usage,   setUsage]   = useState<Maybe<Usage>>(null);
  const [record,  setRecord]  = useState<Maybe<Actions>>(null);
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

  // Usage and the record are read each time their tab opens. A 503 means the
  // tables are not there yet, which the tab says in place of an error.
  useEffect(() => {
    if (!token || !isAdmin || (tab !== "usage" && tab !== "activity")) return;
    let stopped = false;
    const missing = (e: unknown) =>
      (e as { status?: number })?.status === 503 ? { unavailable: errorMessage(e) } : null;
    if (tab === "usage") {
      BackendAPI.adminGetUsage(token, 30)
        .then((d: Usage) => { if (!stopped) setUsage({ data: d }); })
        .catch((e: unknown) => {
          if (stopped) return;
          const m = missing(e);
          if (m) setUsage(m); else setError(errorMessage(e));
        });
    } else {
      BackendAPI.adminGetActions(token, 200)
        .then((d: Actions) => { if (!stopped) setRecord({ data: d }); })
        .catch((e: unknown) => {
          if (stopped) return;
          const m = missing(e);
          if (m) setRecord(m); else setError(errorMessage(e));
        });
    }
    return () => { stopped = true; };
  }, [tab, token, isAdmin]);

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
      setRecord(null);
    } catch (e) {
      // NOT_AN_OWNER: the server's own words say which setting to change.
      setError(errorMessage(e));
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!token || !confirm(`Permanently delete user ${email}? This cannot be undone.`)) return;
    setError("");
    try {
      await BackendAPI.adminDeleteUser(token, userId);
      await load();
      setRecord(null);
    } catch (e) { setError(errorMessage(e)); }
  };

  if (isLoading || !token) return null;
  if (!isAdmin) return null;

  const PlanButtons = ({ u }: { u: UserRow }) => (
    <div className="admin-actions">
      {u.plan !== "pro" && (
        <button className="atlas-btn cobalt" onClick={() => handleSetPlan(u, "pro")}>→ Pro</button>
      )}
      {u.plan !== "free" && (
        <button className="atlas-btn" onClick={() => handleSetPlan(u, "free")}>→ Free</button>
      )}
      {u.plan !== "admin" && (
        <button className="atlas-btn" onClick={() => handleSetPlan(u, "admin")}>→ Admin</button>
      )}
      <button className="atlas-btn danger" onClick={() => handleDeleteUser(u.id, u.email)}>Delete</button>
    </div>
  );

  const PlanPill = ({ u }: { u: UserRow }) => (
    <>
      <span className={`admin-pill ${u.plan}`}>{u.plan}</span>
      {u.stripeSubscriptionId && <span className="admin-pill ok" style={{ marginLeft: "6px" }}>paying</span>}
    </>
  );

  const day = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-CA") : "—";

  const live = updatedAt && (tab === "overview" || tab === "visits");

  return (
    <div className="dig-body">
      <div className="admin-page">

        {/* Header */}
        <div className="admin-head">
          <div>
            <p className="atlas-eyebrow">Admin</p>
            <h1>Platform dashboard</h1>
          </div>
          <button className="atlas-btn" onClick={() => router.push("/dashboard")}>
            ← Your dashboard
          </button>
        </div>

        {error && (
          <div className="atlas-notice bad" role="alert" style={{ marginBottom: "20px" }}>
            <span>{error}</span>
            <button className="atlas-btn" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          {TABS.map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="admin-updated">
          {live ? `Updated ${Math.max(0, Math.round((Date.now() - (updatedAt ?? 0)) / 1000))}s ago · refreshes every 15 seconds` : ""}
        </p>

        {/* Overview */}
        {tab === "overview" && stats && (
          <div>
            <div className="admin-stats">
              <StatCard label="Total users"      value={stats.totalUsers} red />
              <StatCard label="Free users"       value={stats.freeUsers} />
              <StatCard label="Pro users"        value={stats.proUsers} />
              <StatCard label="Active today"     value={stats.activeToday} />
              <StatCard label="Active this week" value={stats.activeThisWeek} />
            </div>

            <div className="admin-panel">
              <h3>System health</h3>
              {/* Each service is really tried by the server, each time. */}
              {!health ? (
                <p className="admin-note">Checking…</p>
              ) : health.map(s => (
                <div key={s.name} className="admin-row">
                  <span>
                    {s.name}
                    {s.note && <small style={s.ok ? undefined : { color: "var(--danger-text)" }}>{s.note}</small>}
                  </span>
                  <span className={s.ok ? "admin-pill ok" : "admin-pill bad"}>
                    {s.ok ? `✓ ok · ${s.ms} ms` : "✕ down"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics */}
        {tab === "analytics" && (
          !analytics ? (
            <p className="admin-note">Loading analytics…</p>
          ) : (
            <div>
              <p className="admin-note">Last {analytics.windowDays} days</p>

              <div className="admin-stats">
                <StatCard label="Analyses" value={analytics.totals.analyses} red
                  sub={`${analytics.totals.failed} failed`} />
                <StatCard label="Success rate"
                  value={`${Math.round(analytics.totals.successRate * 100)}%`} />
                <StatCard label="AI cost"
                  value={`$${analytics.totals.totalCostUsd.toFixed(2)}`}
                  sub={`${analytics.totals.costedRuns} runs recorded cost`} />
                <StatCard label="Avg cost / analysis"
                  value={`$${analytics.totals.avgCostUsd.toFixed(4)}`}
                  sub={`${(analytics.totals.tokensIn / 1000).toFixed(0)}k in / ${(analytics.totals.tokensOut / 1000).toFixed(0)}k out tokens`} />
                <StatCard label="Active analysts"
                  value={analytics.users.activeAnalysts}
                  sub={`of ${analytics.users.total} users`} />
                <StatCard label="Est. MRR"
                  value={`$${analytics.users.estimatedMrrUsd.toFixed(2)}`}
                  sub={`${analytics.users.paying ?? analytics.users.pro} paying × $9.99 — see Stripe for net`} />
              </div>

              <div className="admin-grid-2">
                <DayBarChart title="Analyses per day" days={analytics.perDay}
                  value={d => d.analyses} format={v => `${v}`} />
                <DayBarChart title="AI cost per day (USD)" days={analytics.perDay}
                  value={d => d.costUsd} format={v => `$${v.toFixed(3)}`} />
              </div>

              {/* Same numbers as a table — for screen readers, and for anyone
                  who wants the exact values rather than bar heights. */}
              <details className="admin-panel">
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Daily numbers as a table</summary>
                <div className="admin-table-wrap" style={{ marginTop: "12px" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>{["Date", "Analyses", "Failed", "Cost (USD)"].map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {analytics.perDay.map(d => (
                        <tr key={d.date}>
                          <td className="faint">{d.date}</td>
                          <td>{d.analyses}</td>
                          <td style={d.failed > 0 ? { color: "var(--danger-text)" } : undefined}>{d.failed}</td>
                          <td>${d.costUsd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )
        )}

        {/* Usage: what signed-in people do, counted per day */}
        {tab === "usage" && (
          !usage ? (
            <p className="admin-note">Loading usage…</p>
          ) : "unavailable" in usage ? (
            <Unavailable message={usage.unavailable} />
          ) : (() => {
            const u = usage.data;
            const offered = n(u.totals, "suggestion_offered");
            const applied = n(u.totals, "suggestion_applied");
            return (
              <div>
                <p className="admin-note">
                  Last {u.windowDays} days · daily totals only, not linked to anyone
                </p>
                <div className="admin-stats">
                  <StatCard label="Questions asked" value={n(u.totals, "question")} red
                    sub={`${n(u.today, "question")} today`} />
                  <StatCard label="Off-topic, refused" value={n(u.totals, "question_refused")}
                    sub={`${n(u.today, "question_refused")} today`} />
                  <StatCard label="Report edits" value={n(u.totals, "report_edit")}
                    sub={`${n(u.totals, "report_restore")} older versions brought back`} />
                  <StatCard label="Chat suggestions applied" value={applied}
                    sub={offered > 0
                      ? `of ${offered} offered · ${Math.max(0, offered - applied)} not taken`
                      : "none offered yet"} />
                  <StatCard label="Runs refused" value={n(u.totals, "run_refused")}
                    sub={`${n(u.today, "run_refused")} today · allowance or limits`} />
                  <StatCard label="Uploads refused" value={n(u.totals, "upload_refused")}
                    sub="files DIG could not read as a table" />
                  <StatCard label={"“Check these figures”"} value={n(u.totals, "figures_unmatched")}
                    sub="reports with a figure DIG could not match" />
                  <StatCard label="Teams" value={u.teams} sub="all time" />
                  <StatCard label="Shared reports" value={u.sharedReports} sub="all time" />
                </div>

                <div className="admin-grid-2">
                  <DayBarChart title="Questions per day" days={u.perDay}
                    value={d => d.questions} format={v => `${v}`} />
                  <DayBarChart title="Edits per day (saves + applied suggestions)" days={u.perDay}
                    value={d => d.edits} format={v => `${v}`} />
                </div>

                <div className="admin-panel">
                  <h3>Which findings people keep</h3>
                  <p className="admin-note">
                    Each report adds one &ldquo;shown&rdquo; per insight; a save adds one when an insight is deleted
                    or rewritten. DIG leans its next reports toward the kinds people keep.
                  </p>
                  {u.findingsKept.length === 0 ? (
                    <p className="admin-note">Nothing yet.</p>
                  ) : (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>{["Kind of finding", "Shown", "Deleted", "Rewritten", "Kept as written"].map(h => <th key={h}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {u.findingsKept.map(k => (
                            <tr key={k.kind}>
                              <td>{KIND_NAMES[k.kind] ?? k.kind}</td>
                              <td>{k.shown}</td>
                              <td>{k.removed}</td>
                              <td>{k.rewritten}</td>
                              <td className="faint">
                                {k.shown > 0
                                  ? `${Math.max(0, Math.round((1 - (k.removed + k.rewritten) / k.shown) * 100))}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Visits, counted on our own server without cookies */}
        {tab === "visits" && (
          !visits ? (
            <p className="admin-note">Loading visits…</p>
          ) : (
            <div>
              <p className="admin-note">
                Last {visits.windowDays} days · counted without cookies; a visitor is told apart only within one day
              </p>
              <div className="admin-stats">
                <StatCard label="Visitors today" value={visits.today.visitors} red
                  sub={`${visits.today.views} page views`} />
                <StatCard label="Visitors, 7 days" value={visits.week.visitors}
                  sub={`${visits.week.views} page views`} />
                <StatCard label={`Visitors, ${visits.windowDays} days`} value={visits.total.visitors}
                  sub={`${visits.total.views} page views`} />
              </div>
              <DayBarChart title="Visitors per day" days={visits.perDay}
                value={d => d.visitors} format={v => `${v}`} />
              <div className="admin-grid-2">
                {[
                  { title: "Top pages", rows: visits.topPages.map(p => ({ key: p.path, label: p.path, views: p.views })) },
                  { title: "Where visitors came from", rows: visits.topSources.map(s => ({ key: s.source, label: s.source, views: s.views })) },
                ].map(block => (
                  <div key={block.title} className="admin-panel">
                    <h3>{block.title}</h3>
                    {block.rows.length === 0 ? (
                      <p className="admin-note">Nothing yet.</p>
                    ) : block.rows.map(r => (
                      <div key={r.key} className="admin-row">
                        <span style={{ overflowWrap: "anywhere" }}>{r.label}</span>
                        <span className="admin-stat-sub">{r.views} views</span>
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
            <div className="admin-filters">
              <form onSubmit={handleSearch}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by email or name…" aria-label="Search users" />
                <button type="submit" className="atlas-btn cobalt" disabled={busy}>Search</button>
              </form>
              <select value={planFilter} aria-label="Filter by plan"
                onChange={e => { setPlanFilter(e.target.value); setPage(1); }}>
                <option value="">All plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <p className="admin-note">{total} {total === 1 ? "user" : "users"} total</p>

            {/* Wide screens: a table */}
            <div className="admin-table-wrap admin-users-table">
              <table className="admin-table">
                <thead>
                  <tr>{["User", "Plan", "Active", "Joined", "Actions"].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.userName}</strong>
                        <div className="faint" style={{ overflowWrap: "anywhere" }}>{u.email}</div>
                      </td>
                      <td><PlanPill u={u} /></td>
                      <td className="faint">{day(u.lastActive)}</td>
                      <td className="faint">{day(u.createdAt)}</td>
                      <td><PlanButtons u={u} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: one card per person */}
            <div className="admin-user-cards">
              {users.map(u => (
                <div key={u.id} className="admin-user-card">
                  <div>
                    <p><strong>{u.userName}</strong></p>
                    <p className="faint">{u.email}</p>
                  </div>
                  <div><PlanPill u={u} /></div>
                  <p className="faint">Active {day(u.lastActive)} · joined {day(u.createdAt)}</p>
                  <PlanButtons u={u} />
                </div>
              ))}
            </div>

            {total > 20 && (
              <div className="admin-pages">
                <button className="atlas-btn" onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1} aria-label="Previous page">←</button>
                <span>Page {page} of {Math.ceil(total / 20)}</span>
                <button className="atlas-btn" onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / 20)} aria-label="Next page">→</button>
              </div>
            )}
          </div>
        )}

        {/* Activity: who changed or deleted what */}
        {tab === "activity" && (
          !record ? (
            <p className="admin-note">Loading the record…</p>
          ) : "unavailable" in record ? (
            <Unavailable message={record.unavailable} />
          ) : (
            <div>
              {!record.data.ownerListOn && (
                <div className="atlas-notice warn" role="status" style={{ marginBottom: "16px" }}>
                  <span>
                    The owner list is off, so any admin account can use this page. Set Admin__OwnerIds in the
                    server settings to the account ids allowed in.
                  </span>
                </div>
              )}
              <p className="admin-note">
                Every plan change and account deletion made from this page, newest first. Emails are partly hidden;
                entries older than two years are removed.
              </p>
              <div className="admin-panel">
                {record.data.actions.length === 0 ? (
                  <p className="admin-note" style={{ margin: 0 }}>Nothing on record yet.</p>
                ) : record.data.actions.map((a, i) => (
                  <div key={`${a.at}-${i}`} className="admin-row">
                    <span>
                      <strong>{ACTION_NAMES[a.action] ?? a.action}</strong>
                      {" · "}{a.targetEmail || "—"}
                      {a.detail && <small>{a.detail}</small>}
                    </span>
                    <span className="admin-stat-sub admin-when">
                      {new Date(a.at).toLocaleString("en-CA")}
                      <small>by {a.adminEmail || "—"}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
