import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AnalysisChatCard from "@/components/AnalysisChatCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * Cancel only clears the chat. Once a run has started on the server it cannot
 * stop it, so it goes away instead of pretending to.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));
vi.mock("@/components/ChatCustomizationPanel", () => ({ default: () => null }));

const send = vi.fn();
const dataset = { fileName: "jobs.xlsx", fileSizeBytes: 1024, rowCount: 10, columnCount: 4, isPending: true };

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  send.mockReset();
  BackendAPI.sendChatMessage = send as unknown as typeof BackendAPI.sendChatMessage;
});

async function askedToClean(onAnalysisStarted = vi.fn()) {
  send.mockResolvedValueOnce({ reply: "Clean it?", condition: "not_clean", requiresResponse: true });
  render(<AnalysisChatCard dataset={dataset} onAnalysisStarted={onAnalysisStarted} />);
  fireEvent.click(screen.getByRole("button", { name: /start/i }));
  await screen.findByText("Clean it?", undefined, { timeout: 2000 });
  return onAnalysisStarted;
}

describe("the Cancel button", () => {
  it("is there while nothing has started", async () => {
    await askedToClean();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("goes away once the run starts", async () => {
    const started = await askedToClean();
    send.mockResolvedValueOnce({ reply: "Running…", requiresResponse: false, analysisId: "run-1" });

    fireEvent.click(screen.getByRole("button", { name: /^no$/i }));

    await waitFor(() => expect(started).toHaveBeenCalledWith("run-1"));
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("stays when the answer did not start a run", async () => {
    const started = await askedToClean();
    send.mockResolvedValueOnce({ reply: "Allowance used up.", failed: true });

    fireEvent.click(screen.getByRole("button", { name: /^no$/i }));

    await screen.findByText("Allowance used up.");
    expect(started).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
