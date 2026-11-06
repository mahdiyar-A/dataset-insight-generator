import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import PlanManagementPage from "@/app/dashboard/plan/page";
import BackendAPI from "@/lib/BackendAPI";

/**
 * After paying, a person lands here before Stripe's confirmation may have reached
 * the server, so the page keeps checking for a few seconds rather than showing Free.
 */

const refreshUser = vi.fn();
const getPlans = vi.fn();
let search = "upgraded=1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { plan: "free" }, refreshUser, isLoading: false }),
}));

const free = { plan: "free", reportsUsed: 0, reportsLimit: 2, historyLimit: 5 };
const pro = { ...free, plan: "pro" };

async function waitSeconds(seconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000); });
}

beforeEach(() => {
  vi.useFakeTimers();
  search = "upgraded=1";
  refreshUser.mockReset();
  getPlans.mockReset();
  BackendAPI.getPlans = getPlans as unknown as typeof BackendAPI.getPlans;
});

afterEach(() => { vi.useRealTimers(); });

describe("coming back from Stripe", () => {
  it("picks up the upgrade once the confirmation lands", async () => {
    getPlans.mockResolvedValueOnce({ userPlan: free }).mockResolvedValue({ userPlan: pro });
    render(<PlanManagementPage />);

    await waitSeconds(4);

    expect(getPlans.mock.calls.length).toBeGreaterThan(1);
    expect(refreshUser).toHaveBeenCalledTimes(2);
  });

  it("stops checking once the plan is Pro", async () => {
    getPlans.mockResolvedValue({ userPlan: pro });
    render(<PlanManagementPage />);
    await waitSeconds(1);
    const calls = getPlans.mock.calls.length;

    await waitSeconds(30);

    expect(getPlans.mock.calls.length).toBe(calls);
  });

  it("gives up after a few tries", async () => {
    getPlans.mockResolvedValue({ userPlan: free });
    render(<PlanManagementPage />);

    await waitSeconds(120);

    expect(getPlans.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("does not check again on an ordinary visit", async () => {
    search = "";
    getPlans.mockResolvedValue({ userPlan: free });
    render(<PlanManagementPage />);

    await waitSeconds(30);

    expect(getPlans).toHaveBeenCalledTimes(1);
  });
});
