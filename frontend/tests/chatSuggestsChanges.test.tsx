import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalysisQA from "@/components/AnalysisQA";
import ReportEditor from "@/components/ReportEditor";
import { describeChange } from "@/components/ChangeCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The chat suggests changes to the report, and offers next steps.
 *
 * Risk focus: the owner sees exactly what would change before anything is
 * saved, nothing is saved without Apply, every save can be undone, a chart
 * button costs no question, and an open editor never silently loses edits.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const PICTURE = "data:image/png;base64,iVBORw0KGgo=";

const suggestion = (over: Record<string, unknown> = {}) => ({
  id: "p1", baseVersion: 1,
  preview: [{ op: "set_text", section: "executiveSummary", before: "Revenue rose.", after: "Revenue rose all year." }],
  warnings: [],
  ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  answer: "I'd shorten the summary.", refused: false, failed: false, grounding: "analysis",
  unverifiedNumbers: [], queries: [], remaining: 9, limit: 10, proposal: suggestion(), ...over,
});

const fail = (status: number, code: string | null = null, message = "server words") =>
  Object.assign(new Error(message), { status, code });

const STEPS = [
  { kind: "ask", what: "insight", about: ["revenue", "units"] },
  { kind: "chart", what: "compare", about: ["revenue", "region"],
    chart: { type: "box", x: "region", y: "revenue" }, label: "revenue by region" },
];

let ask: ReturnType<typeof vi.fn>;
let nextSteps: ReturnType<typeof vi.fn>;
let applyProposal: ReturnType<typeof vi.fn>;
let restoreReport: ReturnType<typeof vi.fn>;
let drawChart: ReturnType<typeof vi.fn>;
let changes: CustomEvent[];
const listen = (e: Event) => changes.push(e as CustomEvent);

beforeEach(() => {
  ask = vi.fn().mockResolvedValue(answer());
  nextSteps = vi.fn().mockResolvedValue([]);
  applyProposal = vi.fn().mockResolvedValue({ version: 2 });
  restoreReport = vi.fn().mockResolvedValue({ version: 3 });
  drawChart = vi.fn().mockResolvedValue({
    proposal: suggestion({
      id: "p2",
      preview: [{ op: "add_chart", chart: "revenue by region", after: "", type: "box", under: null, picture: PICTURE }],
    }),
  });
  Object.assign(BackendAPI, { chatAsk: ask, getNextSteps: nextSteps, applyProposal, restoreReport, drawChart });
  changes = [];
  window.addEventListener("dig:report-changed", listen);
});

afterEach(() => window.removeEventListener("dig:report-changed", listen));

async function send(text = "Make the summary shorter") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

async function suggested() {
  render(<AnalysisQA analysisId="a1" />);
  const user = await send();
  await screen.findByRole("region", { name: "Suggested change" });
  return user;
}

// ── The card ─────────────────────────────────────────────────────────────────

describe("a suggestion", () => {
  it("shows what would change, side by side, and saves nothing until Apply", async () => {
    await suggested();

    const card = screen.getByRole("region", { name: "Suggested change" });
    expect(within(card).getByText("Rewrite: Summary")).toBeInTheDocument();
    expect(within(card).getByText("Revenue rose.")).toBeInTheDocument();
    expect(within(card).getByText("Revenue rose all year.")).toBeInTheDocument();
    expect(within(card).getByText("Now")).toBeInTheDocument();
    expect(within(card).getByText("Suggested")).toBeInTheDocument();
    expect(applyProposal).not.toHaveBeenCalled();
    expect(changes).toHaveLength(0);
  });

  it("warns about figures nobody computed before it is applied", async () => {
    ask.mockResolvedValue(answer({ proposal: suggestion({ warnings: ["9999999"] }) }));
    await suggested();

    expect(screen.getByRole("note")).toHaveTextContent("Check these figures before applying: 9999999");
  });

  it("is applied by its id, says which version it became, and tells the editor", async () => {
    const user = await suggested();
    nextSteps.mockClear();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Applied as version 2. The report files were rebuilt.")).toBeInTheDocument();
    expect(applyProposal).toHaveBeenCalledWith("tok", "a1", "p1");
    expect(changes.map(e => e.detail)).toEqual([{ analysisId: "a1", version: 2 }]);
    expect(nextSteps).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("can be undone, back to the version it was made to", async () => {
    const user = await suggested();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    expect(await screen.findByText(/Undone\. The report is back as it was, saved as version 3/)).toBeInTheDocument();
    expect(restoreReport).toHaveBeenCalledWith("tok", "a1", 2, 1);
    expect(changes.map(e => e.detail.version)).toEqual([2, 3]);
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("can be discarded, which asks the server nothing", async () => {
    const user = await suggested();

    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByText("Discarded. The report wasn't changed.")).toBeInTheDocument();
    expect(applyProposal).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("is not offered when the answer carries none", async () => {
    ask.mockResolvedValue(answer({ proposal: null }));
    render(<AnalysisQA analysisId="a1" />);

    await send();

    await screen.findByText("I'd shorten the summary.");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("when applying goes wrong", () => {
  it("explains a report changed since the suggestion, and closes the card", async () => {
    applyProposal.mockRejectedValue(fail(409, "CHANGED_SINCE_OPENED"));
    const user = await suggested();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed after this was suggested");
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(changes).toHaveLength(0);
  });

  it("explains a suggestion that is gone", async () => {
    applyProposal.mockRejectedValue(fail(404, "SUGGESTION_EXPIRED"));
    const user = await suggested();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available. Ask again.");
  });

  it("keeps Apply after a moment's outage", async () => {
    applyProposal.mockRejectedValueOnce(fail(503, "UNAVAILABLE"));
    const user = await suggested();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be made just now");

    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/Applied as version 2/)).toBeInTheDocument();
  });

  it("does not offer an Undo that would overwrite a later change", async () => {
    restoreReport.mockRejectedValue(fail(409, "CHANGED_SINCE_OPENED"));
    const user = await suggested();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await user.click(await screen.findByRole("button", { name: /Undo/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Edit the report → Versions");
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });
});

// ── Next steps ───────────────────────────────────────────────────────────────

describe("next steps", () => {
  it("replace the fixed suggestions, and say which ones cost a question", async () => {
    nextSteps.mockResolvedValue(STEPS);
    render(<AnalysisQA analysisId="a1" />);

    expect(await screen.findByRole("button", { name: "Add an insight about revenue and units" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a chart: revenue by region/ })).toBeInTheDocument();
    expect(screen.getByText("Chart buttons are free. The others use one question.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What is the most important finding?" })).not.toBeInTheDocument();
    expect(nextSteps).toHaveBeenCalledWith("tok", "a1");
  });

  it("an insight button asks the chat, once", async () => {
    nextSteps.mockResolvedValue(STEPS);
    render(<AnalysisQA analysisId="a1" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Add an insight about revenue and units" }));

    await screen.findByRole("region", { name: "Suggested change" });
    expect(ask.mock.calls[0][2]).toBe("Add an insight about revenue and units");
    expect(screen.queryByRole("button", { name: "Add an insight about revenue and units" })).not.toBeInTheDocument();
  });

  it("a chart button has DIG draw it, without the chat, and offers it to apply", async () => {
    nextSteps.mockResolvedValue(STEPS);
    render(<AnalysisQA analysisId="a1" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Add a chart: revenue by region/ }));

    const card = await screen.findByRole("region", { name: "Suggested change" });
    expect(drawChart).toHaveBeenCalledWith("tok", "a1", { type: "box", x: "region", y: "revenue" }, "revenue by region");
    expect(ask).not.toHaveBeenCalled();
    expect(within(card).getByRole("img", { name: "revenue by region" })).toHaveAttribute("src", PICTURE);
    expect(within(card).getByText("Add a box plot")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Apply" }));
    expect(applyProposal).toHaveBeenCalledWith("tok", "a1", "p2");
  });

  it("a chart that cannot be drawn says why", async () => {
    nextSteps.mockResolvedValue(STEPS);
    drawChart.mockRejectedValue(fail(422, "CANNOT_DRAW", "'region' is not a number column."));
    render(<AnalysisQA analysisId="a1" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: /Add a chart/ }));

    expect(await screen.findByText("'region' is not a number column.")).toBeInTheDocument();
  });

  it("a chart that could not be drawn for a moment leaves nothing in the conversation", async () => {
    nextSteps.mockResolvedValue(STEPS);
    drawChart.mockRejectedValue(fail(503, "UNAVAILABLE"));
    render(<AnalysisQA analysisId="a1" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: /Add a chart/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The chart couldn't be drawn just now");
    expect(screen.queryByText("Add a chart: revenue by region", { selector: ".msg" })).not.toBeInTheDocument();
  });

  it("say they are free when they are all charts", async () => {
    nextSteps.mockResolvedValue([STEPS[1]]);
    render(<AnalysisQA analysisId="a1" />);

    expect(await screen.findByText("These are free: no question is used.")).toBeInTheDocument();
  });
});

// ── How a change is described ────────────────────────────────────────────────

describe("each kind of change, in words", () => {
  const c = {
    types: { bar: "a bar chart" }, sections: { conclusion: "Conclusion" },
    rewrite: (s: string) => `Rewrite: ${s}`, rewriteInsight: (n: number) => `Rewrite insight ${n}`,
    moveInsight: (n: number, t: string, to: number) => `Move ${n} ${t} ${to}`,
    removeInsight: (n: number, t: string) => `Remove ${n} ${t}`,
    editChart: (l: string) => `Edit ${l}`, removeChart: (l: string) => `Drop ${l}`,
    redrawChart: (l: string, ty: string) => `Redraw ${l} as ${ty}`,
    rewriteAnswer: (q: string) => `Answer ${q}`, addInsight: (n: number) => `New ${n}`, addChart: (ty: string) => `Add ${ty}`,
  };

  it.each([
    [{ op: "set_text", section: "conclusion" }, "Rewrite: Conclusion"],
    [{ op: "set_insight", position: 2 }, "Rewrite insight 2"],
    [{ op: "move_insight", position: 2, title: "T", to: 1 }, "Move 2 T 1"],
    [{ op: "remove_insight", position: 1, title: "T" }, "Remove 1 T"],
    [{ op: "set_chart", chart: "C" }, "Edit C"],
    [{ op: "remove_chart", chart: "C" }, "Drop C"],
    [{ op: "redraw_chart", chart: "C", type: "bar" }, "Redraw C as a bar chart"],
    [{ op: "set_answer", question: "Q" }, "Answer Q"],
    [{ op: "add_insight", position: 3 }, "New 3"],
    [{ op: "add_chart", type: "bar" }, "Add a bar chart"],
  ])("%j", (p, words) => {
    expect(describeChange(p, c)).toBe(words);
  });

  it("shows a new insight with the basis line DIG wrote", async () => {
    ask.mockResolvedValue(answer({ proposal: suggestion({ preview: [{
      op: "add_insight", title: "Units follow revenue", after: "They move together.", position: 2,
      basedOn: ["revenue and units rise together (r = 0.82, 300 rows)"] }] }) }));
    await suggested();

    expect(screen.getByText("New insight, at place 2")).toBeInTheDocument();
    expect(screen.getByText("Units follow revenue")).toBeInTheDocument();
    expect(screen.getByText("revenue and units rise together (r = 0.82, 300 rows)")).toBeInTheDocument();
  });
});

// ── The editor catches up ────────────────────────────────────────────────────

describe("an open editor", () => {
  const doc = (summary = "Summary") => ({
    schema: 1,
    text: { reportTitle: "Sales", introduction: "", executiveSummary: summary, conclusion: "",
            dataQualitySection: "", assumptions: "" },
    insights: [{ id: "i1", title: "North leads", body: "x", basedOn: [] }],
    charts: [{ file: 6, label: "Drawn later", desc: "", insight: "i1" }],
    questionAnswers: [], facts: { language: "en" },
  });
  const opened = (version: number, summary?: string) => ({
    editable: true, version, document: doc(summary), warnings: [], versions: [],
    pictures: { "6": "https://signed.example/chart_6.png" },
  });
  let getReport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getReport = vi.fn().mockResolvedValue(opened(1));
    BackendAPI.getReport = getReport as unknown as typeof BackendAPI.getReport;
    BackendAPI.getVisualizations = vi.fn().mockResolvedValue([]) as unknown as typeof BackendAPI.getVisualizations;
  });

  async function openEditor() {
    const user = userEvent.setup();
    render(<ReportEditor analysis={{ id: "a1" }} ready />);
    await user.click(screen.getByRole("button", { name: "Edit the report" }));
    await screen.findByRole("textbox", { name: "Report title" });
    return user;
  }

  const changedFromChat = (analysisId = "a1", version = 2) =>
    act(() => { window.dispatchEvent(new CustomEvent("dig:report-changed", { detail: { analysisId, version } })); });

  it("shows a chart DIG drew later, from the link the server gave", async () => {
    await openEditor();

    expect(screen.getByRole("img", { name: "Drawn later" })).toHaveAttribute("src", "https://signed.example/chart_6.png");
    expect(BackendAPI.getVisualizations).not.toHaveBeenCalled();
  });

  it("shows a change applied from the chat when nothing is unsaved", async () => {
    await openEditor();
    getReport.mockResolvedValue(opened(2, "Shorter."));

    changedFromChat();

    expect(await screen.findByDisplayValue("Shorter.")).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
  });

  it("keeps unsaved edits and offers a reload instead", async () => {
    const user = await openEditor();
    await user.type(screen.getByRole("textbox", { name: "Summary" }), " mine");

    changedFromChat();

    expect(await screen.findByRole("alert")).toHaveTextContent("A change from the chat was saved as a new version");
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Summary mine");
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it("ignores a change to another analysis", async () => {
    await openEditor();

    changedFromChat("another");

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(1));
  });
});
