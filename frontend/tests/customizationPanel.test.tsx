import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatCustomizationPanel from "@/components/ChatCustomizationPanel";
import BackendAPI from "@/lib/BackendAPI";
import { DEFAULT_SETTINGS, MAX_QUESTIONS } from "@/lib/reportSettings";

/**
 * The settings a Pro user chooses, by hand or in their own words. The panel is
 * controlled, so these tests hold the value the way the dashboard does.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Settings = typeof DEFAULT_SETTINGS;

let latest: Settings | null = null;

function Harness({ initial = null, isPro = true }: { initial?: Settings | null, isPro?: boolean }) {
  const [value, setValue] = useState<Settings | null>(initial);
  latest = value;
  return <ChatCustomizationPanel value={value} onChange={setValue} isPro={isPro} />;
}

const briefReply = (over = {}) => ({
  settings: { tone: "casual", insightsCount: 3 }, summary: "Short and casual.",
  notPossible: [], source: "model", remaining: 29, ...over,
});

let brief: ReturnType<typeof vi.fn>;

beforeEach(() => {
  latest = null;
  brief = vi.fn().mockResolvedValue(briefReply());
  BackendAPI.chatBrief = brief as unknown as typeof BackendAPI.chatBrief;
});

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Customize report/ }));
  return user;
}

async function writeBrief(user: ReturnType<typeof userEvent.setup>, text = "Short and casual") {
  await user.type(screen.getByRole("textbox", { name: "Describe the report you want" }), text);
  await user.click(screen.getByRole("button", { name: "Fill in the settings" }));
}

describe("plans", () => {
  it("shows a free user the offer instead of the panel", () => {
    render(<Harness isPro={false} />);

    expect(screen.getByText("Upgrade →")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Customize report/ })).not.toBeInTheDocument();
  });
});

describe("the brief", () => {
  it("fills in the panel, and only that", async () => {
    render(<Harness />);
    const user = await open();

    await writeBrief(user);

    expect(await screen.findByText("Short and casual.")).toBeInTheDocument();
    expect(brief).toHaveBeenCalledWith("tok", "Short and casual", "en");
    expect(latest?.tone).toBe("casual");
    expect(screen.getByRole("combobox", { name: "Tone" })).toHaveValue("casual");
    expect(screen.getByRole("combobox", { name: "Insights" })).toHaveValue("3");
  });

  it("says what it couldn't do", async () => {
    brief.mockResolvedValue(briefReply({ notPossible: ["Add a video"] }));
    render(<Harness />);
    const user = await open();

    await writeBrief(user);

    expect(await screen.findByText(/Not possible: Add a video/)).toBeInTheDocument();
  });

  it("says so when the assistant was busy and the words became the focus", async () => {
    brief.mockResolvedValue(briefReply({ settings: { focusOn: "Short" }, summary: "", source: "fallback" }));
    render(<Harness />);
    const user = await open();

    await writeBrief(user);

    expect(await screen.findByRole("status")).toHaveTextContent("The assistant is busy");
    expect(screen.getByRole("textbox", { name: "Focus on" })).toHaveValue("Short");
  });

  it("leaves the panel alone when the assistant can't be reached", async () => {
    brief.mockRejectedValue(Object.assign(new Error("x"), { code: "ASSISTANT_UNAVAILABLE" }));
    render(<Harness />);
    const user = await open();

    await writeBrief(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be reached");
    expect(latest).toBeNull();
  });

  it("says when today's descriptions have run out", async () => {
    brief.mockRejectedValue(Object.assign(new Error("x"), { code: "CHAT_LIMIT" }));
    render(<Harness />);
    const user = await open();

    await writeBrief(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("used today's descriptions");
  });

  it("does not run with nothing written", async () => {
    render(<Harness />);
    await open();

    expect(screen.getByRole("button", { name: "Fill in the settings" })).toBeDisabled();
  });
});

describe("setting things by hand", () => {
  it("holds assumptions, things to leave out and the writing format", async () => {
    render(<Harness />);
    const user = await open();

    await user.type(screen.getByRole("textbox", { name: "Assumptions" }), "Q4 is partial");
    await user.type(screen.getByRole("textbox", { name: "Leave out" }), "2020");
    await user.selectOptions(screen.getByRole("combobox", { name: "Writing format" }), "bullets");

    expect(latest?.assumptions).toBe("Q4 is partial");
    expect(latest?.avoid).toBe("2020");
    expect(latest?.writingFormat).toBe("bullets");
  });

  it("offers every insight count from 1 to 10", async () => {
    render(<Harness />);
    await open();

    const options = screen.getByRole("combobox", { name: "Insights" }).querySelectorAll("option");

    expect([...options].map((o) => o.value)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });

  it("adds a question with a note, and removes it", async () => {
    render(<Harness />);
    const user = await open();

    await user.click(screen.getByRole("button", { name: "+ Add a question" }));
    await user.type(screen.getByRole("textbox", { name: "Questions to answer 1" }), "Why?");
    await user.type(screen.getByPlaceholderText(/Optional note/), "for the board");

    expect(latest?.questions).toEqual([{ question: "Why?", note: "for the board" }]);

    await user.click(screen.getByRole("button", { name: "Remove 1" }));

    expect(latest?.questions).toEqual([]);
  });

  it("stops offering questions at the limit", async () => {
    const questions = Array.from({ length: MAX_QUESTIONS }, (_, i) => ({ question: `Q${i}`, note: "" }));
    render(<Harness initial={{ ...DEFAULT_SETTINGS, questions }} />);

    expect(screen.queryByRole("button", { name: "+ Add a question" })).not.toBeInTheDocument();
  });

  it("switches Word and PowerPoint on, and the PDF stays", async () => {
    render(<Harness />);
    const user = await open();

    await user.click(screen.getByRole("button", { name: /PowerPoint/ }));

    expect(latest?.outputFormat).toEqual({ pdf: true, word: false, pptx: true });
    expect(screen.getByRole("button", { name: /PDF/ })).toBeDisabled();
  });
});

describe("settings chosen before the upload", () => {
  it("are still there when the card remounts", async () => {
    // Risk: the dashboard remounts this card on every upload. Settings kept
    // inside it were lost, silently, for anyone who wrote a brief first.
    const value = { ...DEFAULT_SETTINGS, focusOn: "churn" };
    const { unmount } = render(<Harness initial={value} />);
    unmount();

    render(<ChatCustomizationPanel value={value} isPro />);

    expect(screen.getByRole("textbox", { name: "Focus on" })).toHaveValue("churn");
  });

  it("show on the closed panel as a count", async () => {
    render(<Harness initial={{ ...DEFAULT_SETTINGS, focusOn: "churn", mustMention: ["a"] }} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Customize report/ }));

    await waitFor(() => expect(screen.getByText("2 directives")).toBeInTheDocument());
  });
});
