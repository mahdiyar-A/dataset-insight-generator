import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import DashboardPage from "@/app/dashboard/page";
import BackendAPI from "@/lib/BackendAPI";
import { CHECK_EVERY_MS, NO_ANSWER_LIMIT_MS } from "@/lib/followAnalysis";

/**
 * A real person's run: the analysis finished in 6 seconds and the page showed
 * "Running…" for 15 minutes. The server sent no id, the page checked a blank
 * address, and every failed check was swallowed as a network blip.
 */

type Auth = { token: string | null; isLoading: boolean; user: object | null };
let auth: Auth;
let startedId: string | null;

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({ ...auth, logout: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en", brightness: 50 }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/UploadCard", () => ({ default: () => null }));
vi.mock("@/components/HistoryTape", () => ({ default: () => null }));
vi.mock("@/components/chartsCard", () => ({ default: () => null }));
vi.mock("@/components/downloadCard", () => ({ default: () => null }));
vi.mock("@/components/infoCards", () => ({ default: () => null }));
vi.mock("@/components/PlanBadge", () => ({ default: () => null }));
vi.mock("@/components/AnalysisChatCard", () => ({
  default: ({ onAnalysisStarted }: { onAnalysisStarted: (id: string | null) => void }) => (
    <button onClick={() => onAnalysisStarted(startedId)}>start</button>
  ),
}));

const status = vi.fn();
const analysis = vi.fn();
const history = vi.fn();

const finished = { id: "run-1", status: "done", fileName: "jobs.xlsx", hasPdfReport: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  auth = { token: "tok", isLoading: false, user: { plan: "free" } };
  startedId = "run-1";
  status.mockReset();
  analysis.mockReset().mockResolvedValue(finished);
  history.mockReset().mockResolvedValue([]);
  BackendAPI.getAnalysisStatus = status as unknown as typeof BackendAPI.getAnalysisStatus;
  BackendAPI.getAnalysis = analysis as unknown as typeof BackendAPI.getAnalysis;
  BackendAPI.getHistory = history as unknown as typeof BackendAPI.getHistory;
  BackendAPI.getActiveAnalysis = vi.fn().mockResolvedValue(null) as unknown as typeof BackendAPI.getActiveAnalysis;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const start = () => fireEvent.click(screen.getByRole("button", { name: "start" }));

describe("following a run", () => {
  it("shows a finished run", async () => {
    status.mockResolvedValue({ status: "done" });
    render(<DashboardPage />);
    await wait(0);

    start();
    await wait(CHECK_EVERY_MS);

    expect(status).toHaveBeenCalledWith("tok", "run-1");
    expect(analysis).toHaveBeenCalledWith("tok", "run-1");
    expect(screen.getByText(/Analysis complete/)).toBeInTheDocument();
  });

  it("uses the signed-in token on a page that loaded before sign-in finished", async () => {
    // A callback kept from the first render held a blank token, so every check
    // would have been refused and swallowed even with the right id.
    auth = { token: null, isLoading: true, user: null };
    const { rerender } = render(<DashboardPage />);
    auth = { token: "signed-in", isLoading: false, user: { plan: "free" } };
    rerender(<DashboardPage />);
    await wait(0);
    status.mockResolvedValue({ status: "done" });

    start();
    await wait(CHECK_EVERY_MS);

    expect(status).toHaveBeenCalledWith("signed-in", "run-1");
    expect(analysis).toHaveBeenCalledWith("signed-in", "run-1");
  });

  it("picks up a token refreshed during the run", async () => {
    status.mockResolvedValue({ status: "processing" });
    const { rerender } = render(<DashboardPage />);
    await wait(0);

    start();
    await wait(CHECK_EVERY_MS);
    auth = { ...auth, token: "refreshed" };
    rerender(<DashboardPage />);
    await wait(CHECK_EVERY_MS);

    expect(status).toHaveBeenLastCalledWith("refreshed", "run-1");
  });
});

describe("a run the page cannot follow", () => {
  it("says so straight away when there is no id, and checks nothing", async () => {
    startedId = null;
    render(<DashboardPage />);
    await wait(0);

    start();
    await wait(CHECK_EVERY_MS * 3);

    expect(status).not.toHaveBeenCalled();
    expect(screen.getByText(/lost track of this analysis/)).toBeInTheDocument();
  });

  it("says so when the server keeps saying there is no such run", async () => {
    status.mockResolvedValue(null);
    render(<DashboardPage />);
    await wait(0);

    start();
    await wait(NO_ANSWER_LIMIT_MS);

    expect(screen.getByText(/lost track of this analysis/)).toBeInTheDocument();
    expect(screen.queryByText(/Analysis running/)).not.toBeInTheDocument();
  });

  it("says so when every check fails", async () => {
    status.mockRejectedValue(new Error("401"));
    render(<DashboardPage />);
    await wait(0);

    start();
    await wait(NO_ANSWER_LIMIT_MS);

    expect(screen.getByText(/lost track of this analysis/)).toBeInTheDocument();
  });

  it("refreshes history, because a lost run may have finished", async () => {
    status.mockResolvedValue(null);
    render(<DashboardPage />);
    await wait(0);
    history.mockClear();

    start();
    await wait(NO_ANSWER_LIMIT_MS);

    expect(history).toHaveBeenCalled();
  });

  it("says so when the finished report cannot be loaded", async () => {
    status.mockResolvedValue({ status: "done" });
    analysis.mockRejectedValue(new Error("500"));
    render(<DashboardPage />);
    await wait(0);

    start();
    await wait(CHECK_EVERY_MS);

    expect(screen.getByText(/lost track of this analysis/)).toBeInTheDocument();
  });
});
