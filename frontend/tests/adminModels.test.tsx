import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminModels from "@/components/AdminModels";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The owner's view of the AI models. DIG runs on free models other companies
 * can withdraw without notice; this is where the owner sees whether each is
 * still there, and proves the alarm works by ringing it once.
 */

const model = (over = {}) => ({
  provider: "groq", model: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B",
  usedFor: ["reports", "answering questions"], status: "ok", ...over,
});
const status = (over = {}) => ({
  checkedAt: "2026-11-11T09:00:00Z",
  models: [model()],
  allowance: { openrouter: { used: 12, limit: 50, remaining: 38 } },
  health: { windowHours: 24, outcomes: {} },
  problems: [], notes: [], ...over,
});

let getModels: ReturnType<typeof vi.fn>;
let testAlert: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getModels = vi.fn().mockResolvedValue(status());
  testAlert = vi.fn().mockResolvedValue({ sent: true, to: "owner@example.com", message: "Sent to owner@example.com." });
  BackendAPI.adminGetModels = getModels as unknown as typeof BackendAPI.adminGetModels;
  BackendAPI.adminTestAlert = testAlert as unknown as typeof BackendAPI.adminTestAlert;
});

describe("the model check", () => {
  it("says so plainly when nothing is wrong", async () => {
    render(<AdminModels token="tok" />);

    expect(await screen.findByText("Nothing is wrong")).toBeInTheDocument();
    expect(screen.getByText("Qwen 3.8 27B")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText(/used today: 12 of 50/)).toBeInTheDocument();
  });

  it("shows a withdrawn model and the server's own sentence about it", async () => {
    const problem = "Qwen 3.8 27B is no longer offered by Groq. DIG uses it for reports and answering questions.";
    getModels.mockResolvedValue(status({ models: [model({ status: "missing" })], problems: [problem] }));
    render(<AdminModels token="tok" />);

    expect(await screen.findByText("One thing needs a look")).toBeInTheDocument();
    expect(screen.getByText(problem)).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("shows the date a model is being withdrawn", async () => {
    getModels.mockResolvedValue(status({ models: [model({ status: "expiring", expires: "2026-11-20" })] }));
    render(<AdminModels token="tok" />);

    expect(await screen.findByText("Being withdrawn")).toBeInTheDocument();
    expect(screen.getByText("until 2026-11-20")).toBeInTheDocument();
  });

  it("counts the reports that had to be written without AI", async () => {
    getModels.mockResolvedValue(status({
      health: { windowHours: 24, outcomes: { report: { total: 8, failed: 2 }, question: { total: 30, failed: 0 } } },
    }));
    render(<AdminModels token="tok" />);

    expect(await screen.findByText("Reports: 8, of which 2 written without AI.")).toBeInTheDocument();
    expect(screen.getByText("Questions: 30, of which 0 left unanswered.")).toBeInTheDocument();
  });

  it("says when the AI service did not answer, and still offers the test", async () => {
    getModels.mockRejectedValue(new Error("The AI service did not answer."));
    render(<AdminModels token="tok" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service did not answer.");
    expect(screen.getByRole("button", { name: "Send a test alert" })).toBeEnabled();
  });
});

describe("the test alert", () => {
  it("sends one and says where it went", async () => {
    render(<AdminModels token="tok" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Send a test alert" }));

    expect(testAlert).toHaveBeenCalledWith("tok");
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to owner@example.com.");
  });

  it("says so when it could not be sent", async () => {
    testAlert.mockResolvedValue({ sent: false, to: "owner@example.com", message: "It was not sent." });
    render(<AdminModels token="tok" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Send a test alert" }));

    expect(await screen.findByRole("status")).toHaveTextContent("It was not sent.");
  });
});
