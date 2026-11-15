import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalysisChatCard from "@/components/AnalysisChatCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * "What is this data about?", asked before the analysis when DIG is not sure.
 *
 * The reading of a file steers the whole report. It used to be made after the
 * person pressed Start and was never shown to them, so a report built on a
 * wrong reading cost them an analysis before they could say so.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));
vi.mock("@/components/ChatCustomizationPanel", () => ({ default: () => null }));
vi.mock("@/components/AnalysisQA", () => ({ default: () => null }));

const send = vi.fn();
const dataset = { fileName: "orders.xlsx", fileSizeBytes: 1024, rowCount: 10, columnCount: 4, isPending: true };

const QUESTION = "Before I start, I want to be sure what this data is about.";
const asking = (over = {}) => ({
  reply: QUESTION, condition: "all_good", requiresResponse: true, ask: "domain",
  options: ["online shop orders, one row per order", "warehouse stock movements"], ...over,
});
const started = { reply: "Starting full analysis now.", condition: "all_good", requiresResponse: false, analysisId: "run-1" };

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  send.mockReset();
  BackendAPI.sendChatMessage = send as unknown as typeof BackendAPI.sendChatMessage;
});

/** Press Start and wait for the server's first reply. */
async function start(firstReply: object, onAnalysisStarted = vi.fn()) {
  send.mockResolvedValueOnce(firstReply);
  render(<AnalysisChatCard dataset={dataset} onAnalysisStarted={onAnalysisStarted} />);
  fireEvent.click(screen.getByRole("button", { name: /start/i }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1), { timeout: 2000 });
  return onAnalysisStarted;
}

const lastCall = () => send.mock.calls[send.mock.calls.length - 1];

describe("when DIG is not sure", () => {
  it("asks, offers its readings, and starts nothing", async () => {
    const onStarted = await start(asking());

    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "online shop orders, one row per order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "warehouse stock movements" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /own words/i })).toBeInTheDocument();
    // Its own answers, not Yes and No.
    expect(screen.queryByRole("button", { name: /^yes$/i })).not.toBeInTheDocument();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("sends DIG's own reading back as confirmed", async () => {
    const onStarted = await start(asking());
    send.mockResolvedValueOnce(started);

    fireEvent.click(await screen.findByRole("button", { name: "online shop orders, one row per order" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run-1"));
    const [, message, meta] = lastCall();
    expect(message).toBe("domain_answer");
    expect(meta).toMatchObject({ domainAnswer: "online shop orders, one row per order", domainConfirmed: true });
  });

  it("sends another reading as what the person said, not as a confirmation", async () => {
    // Risk: treating any button as "yes, you were right" and analysing on the wrong reading.
    await start(asking());
    send.mockResolvedValueOnce(started);

    fireEvent.click(await screen.findByRole("button", { name: "warehouse stock movements" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(lastCall()[2]).toMatchObject({ domainAnswer: "warehouse stock movements", domainConfirmed: false });
  });

  it("sends the person's own words", async () => {
    const onStarted = await start(asking());
    send.mockResolvedValueOnce(started);
    const user = userEvent.setup();

    await user.type(await screen.findByRole("textbox", { name: /own words/i }), "clinic appointments, one row per visit");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run-1"));
    expect(lastCall()[2]).toMatchObject({
      domainAnswer: "clinic appointments, one row per visit", domainConfirmed: false,
    });
    expect(screen.getByText("clinic appointments, one row per visit")).toBeInTheDocument();
  });

  it("lets the person skip the question", async () => {
    const onStarted = await start(asking());
    send.mockResolvedValueOnce(started);

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run-1"));
    expect(lastCall()[2]).toMatchObject({ domainAnswer: "", domainConfirmed: false });
  });

  it("asks with only a text box when no model could read the file", async () => {
    await start(asking({ reply: "Before I start: what is this data about?", options: [] }));

    expect(await screen.findByRole("textbox", { name: /own words/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("goes on to the cleaning question when the file needs it", async () => {
    const onStarted = await start(asking({ condition: "not_clean" }));
    send.mockResolvedValueOnce({ reply: "Clean it?", condition: "not_clean", requiresResponse: true });

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    expect(await screen.findByText("Clean it?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^yes$/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /own words/i })).not.toBeInTheDocument();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("can still be cancelled", async () => {
    await start(asking());
    await screen.findByText(QUESTION);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("when DIG is sure", () => {
  it("says what it read and starts without asking", async () => {
    const onStarted = await start({ ...started, understoodAs: "online shop orders, one row per order" });

    expect(await screen.findByText("This looks like: online shop orders, one row per order.")).toBeInTheDocument();
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run-1"));
    expect(screen.queryByRole("textbox", { name: /own words/i })).not.toBeInTheDocument();
  });

  it("says nothing extra when the server sent no reading", async () => {
    // An AI service that predates this sends none; the chat is as it was.
    await start(started);

    await screen.findByText("Starting full analysis now.");
    expect(screen.queryByText(/This looks like/)).not.toBeInTheDocument();
  });
});
