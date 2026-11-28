import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "@/app/admin/page";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The owner's admin page: the usage numbers, the record of who changed or
 * deleted what, and the plain notice when migration 007 has not been run.
 * Signed in as an admin here; nobody can sign in to the real one from a test.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { plan: "admin" }, isLoading: false }),
}));

const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);

const usage = {
  windowDays: 30,
  totals: {
    question: 41, question_refused: 3, report_edit: 12, report_restore: 2,
    suggestion_offered: 10, suggestion_applied: 7, run_refused: 5, upload_refused: 4, figures_unmatched: 1,
  },
  today: { question: 6, question_refused: 0, run_refused: 1 },
  teams: 2,
  sharedReports: 9,
  perDay: days(30).map(date => ({ date, questions: 1, edits: 0, refused: 0 })),
  findingsKept: [{ kind: "trend", shown: 20, removed: 2, rewritten: 3 }],
};

const unavailable = (message: string) => Object.assign(new Error(message), { status: 503 });

const fake = (name: keyof typeof BackendAPI, impl: (...a: unknown[]) => unknown) => {
  const fn = vi.fn(impl);
  (BackendAPI as unknown as Record<string, unknown>)[name] = fn;
  return fn;
};

beforeEach(() => {
  fake("adminGetStats", async () => ({
    totalUsers: 14, freeUsers: 10, proUsers: 3, adminUsers: 1, activeToday: 2, activeThisWeek: 5,
  }));
  fake("adminGetHealth", async () => ({ checks: [{ name: "Database", ok: true, ms: 40 }] }));
  fake("adminGetUsers", async () => ({
    total: 1,
    users: [{ id: "u1", email: "sam@example.com", userName: "Sam", plan: "pro", isActive: true,
              createdAt: "2026-11-01T00:00:00Z", stripeSubscriptionId: "sub_1" }],
  }));
  fake("adminGetUsage", async () => usage);
  fake("adminGetActions", async () => ({
    ownerListOn: true,
    actions: [{ at: "2026-11-27T10:00:00Z", action: "set_plan", adminEmail: "o***@example.com",
                targetEmail: "s***@example.com", detail: "pro → free, Stripe subscription cancelled" }],
  }));
});

describe("the admin page", () => {
  it("opens on the overview, in red only for the headline number", async () => {
    render(<AdminPage />);

    const total = await screen.findByText("14");
    expect(total).toHaveClass("admin-stat-value", "red");
    expect(screen.getByText("10")).not.toHaveClass("red");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the usage numbers people asked for", async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Usage" }));

    const card = (label: string) => screen.getByText(label).closest(".admin-stat") as HTMLElement;
    expect(await screen.findByText("Questions asked")).toBeInTheDocument();
    expect(within(card("Questions asked")).getByText("41")).toBeInTheDocument();
    expect(within(card("Questions asked")).getByText("6 today")).toBeInTheDocument();
    expect(within(card("Chat suggestions applied")).getByText("of 10 offered · 3 not taken")).toBeInTheDocument();
    expect(within(card("Runs refused")).getByText("5")).toBeInTheDocument();
    expect(within(card("Uploads refused")).getByText("4")).toBeInTheDocument();
    expect(within(card("Teams")).getByText("2")).toBeInTheDocument();
    expect(within(card("Shared reports")).getByText("9")).toBeInTheDocument();
    expect(within(card("“Check these figures”")).getByText("1")).toBeInTheDocument();
    // 20 shown, 5 deleted or rewritten: three in four kept as written.
    expect(screen.getByText("Trend over time")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("says to run migration 007 when the usage tables are missing", async () => {
    fake("adminGetUsage", async () => { throw unavailable("Usage counts aren't available yet: run migration 007 in Supabase."); });
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Usage" }));

    expect(await screen.findByText(/run migration 007/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists who changed or deleted what, with emails masked", async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Activity" }));

    expect(await screen.findByText("Changed plan")).toBeInTheDocument();
    expect(screen.getByText(/s\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("by o***@example.com")).toBeInTheDocument();
    expect(screen.getByText("pro → free, Stripe subscription cancelled")).toBeInTheDocument();
    expect(screen.queryByText(/owner list is off/)).not.toBeInTheDocument();
  });

  it("warns when the owner list is off", async () => {
    fake("adminGetActions", async () => ({ ownerListOn: false, actions: [] }));
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Activity" }));

    expect(await screen.findByText(/owner list is off/)).toBeInTheDocument();
    expect(screen.getByText("Nothing on record yet.")).toBeInTheDocument();
  });

  it("shows the server's words when someone off the owner list is made admin", async () => {
    const words = "Only accounts on the server's owner list can be admin. Add their account id to Admin__OwnerIds in the server settings first.";
    fake("adminSetPlan", async () => { throw Object.assign(new Error(words), { status: 403 }); });
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Users" }));

    // The table and the phone cards both carry the buttons; either does.
    await userEvent.click((await screen.findAllByRole("button", { name: "→ Admin" }))[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(words);
  });

  it("gives each person a card for phones as well as a table row", async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Users" }));

    const cards = await screen.findAllByText("sam@example.com");
    expect(cards).toHaveLength(2);
    expect(cards[1].closest(".admin-user-card")).not.toBeNull();
  });
});
