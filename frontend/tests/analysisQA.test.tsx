import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalysisQA from "@/components/AnalysisQA";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The questions box after an analysis.
 *
 * Risk focus: honesty. A figure the service could not check must be shown as
 * unchecked, a failure on our side must not eat the question, and running out
 * of allowance must say so rather than look broken.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const answer = (over = {}) => ({
  answer: "South leads with 42.", refused: false, failed: false, grounding: "analysis",
  unverifiedNumbers: [], queries: [], remaining: 9, limit: 10, ...over,
});

let ask: ReturnType<typeof vi.fn>;

beforeEach(() => {
  ask = vi.fn().mockResolvedValue(answer());
  BackendAPI.chatAsk = ask as unknown as typeof BackendAPI.chatAsk;
});

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
}

describe("asking", () => {
  it("sends the question for this analysis and shows the answer", async () => {
    render(<AnalysisQA analysisId="a1" />);

    await send("Which region leads?");

    expect(await screen.findByText(/South leads with 42/)).toBeInTheDocument();
    expect(ask).toHaveBeenCalledWith("tok", "a1", "Which region leads?", [], "en");
    expect(screen.getByText("9 questions left today")).toBeInTheDocument();
  });

  it("sends the conversation so far with the next question", async () => {
    render(<AnalysisQA analysisId="a1" />);
    await send("First?");
    await screen.findByText(/South leads/);

    await send("And second?");

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1][3]).toEqual([
      { role: "user", content: "First?" },
      { role: "assistant", content: "South leads with 42." },
    ]);
  });

  it("offers suggestions until the first question, and they ask straight away", async () => {
    render(<AnalysisQA analysisId="a1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "What is the most important finding?" }));

    expect(ask.mock.calls[0][2]).toBe("What is the most important finding?");
    await screen.findByText(/South leads/);
    expect(screen.queryByRole("button", { name: "What should I look at next?" })).not.toBeInTheDocument();
  });

  it("will not send an empty question", async () => {
    render(<AnalysisQA analysisId="a1" />);

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });
});

describe("what an answer says about itself", () => {
  it("flags figures that could not be checked", async () => {
    ask.mockResolvedValue(answer({ unverifiedNumbers: ["42", "17%"] }));
    render(<AnalysisQA analysisId="a1" />);

    await send("How much?");

    expect(await screen.findByText(/Check these figures: 42, 17%/)).toBeInTheDocument();
  });

  it("says when an answer was worked out from the data", async () => {
    ask.mockResolvedValue(answer({ grounding: "data" }));
    render(<AnalysisQA analysisId="a1" />);

    await send("How much?");

    expect(await screen.findByText("Worked out from your data")).toBeInTheDocument();
  });

  it("makes no such claim for an answer from the report", async () => {
    render(<AnalysisQA analysisId="a1" />);

    await send("How much?");

    await screen.findByText(/South leads/);
    expect(screen.queryByText("Worked out from your data")).not.toBeInTheDocument();
  });
});

describe("when it goes wrong", () => {
  const coded = (code: string | null) => Object.assign(new Error("server text"), { code });

  it("puts the question back when the service can't be reached", async () => {
    ask.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AnalysisQA analysisId="a1" />);

    await send("Which region leads?");

    expect(await screen.findByRole("alert")).toHaveTextContent("wasn't counted");
    expect(screen.getByRole("textbox")).toHaveValue("Which region leads?");
  });

  it("does not send a failed question as part of the conversation", async () => {
    ask.mockResolvedValueOnce(answer({ failed: true, answer: "Please try again." }));
    render(<AnalysisQA analysisId="a1" />);
    await send("First?");
    await screen.findByRole("alert");

    await userEvent.setup().click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1][3]).toEqual([]);
  });

  it("closes the box at the daily limit, and offers Pro to free users", async () => {
    ask.mockRejectedValue(coded("CHAT_LIMIT"));
    render(<AnalysisQA analysisId="a1" plan="free" />);

    await send("One more?");

    expect(await screen.findByRole("status")).toHaveTextContent("You've used today's questions");
    expect(screen.getByRole("link", { name: /Pro/ })).toHaveAttribute("href", "/plans");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not offer Pro to someone who has it", async () => {
    ask.mockRejectedValue(coded("CHAT_LIMIT"));
    render(<AnalysisQA analysisId="a1" plan="pro" />);

    await send("One more?");

    await screen.findByRole("status");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("explains an analysis from before questions existed", async () => {
    ask.mockRejectedValue(coded("NO_CHAT_CONTEXT"));
    render(<AnalysisQA analysisId="a1" />);

    await send("Anything?");

    expect(await screen.findByRole("status")).toHaveTextContent("Run it again");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
