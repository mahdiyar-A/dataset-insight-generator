import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportEditor, { describePart, whoSaved } from "@/components/ReportEditor";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The report edited by a team: viewers read it, versions say who saved them,
 * a save made while a teammate saved is combined or refused naming the part,
 * and a teammate's save shows up as it happens.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok", user: { id: "me" } }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

type Live = {
  active: boolean;
  onSaved: (n: object) => void;
  onRemoved: () => void;
  onReconnected: () => void;
};
const live = () => (globalThis as unknown as { __reportLive: Live }).__reportLive;

const doc = (title = "Sales in 2025") => ({
  schema: 1,
  text: { reportTitle: title, introduction: "Intro", executiveSummary: "Summary", conclusion: "End",
          dataQualitySection: "Clean", assumptions: "" },
  insights: [
    { id: "i1", title: "North leads", body: "North sold 120.", basedOn: [] },
    { id: "i2", title: "Q4 dips", body: "Sales fell.", basedOn: [] },
  ],
  charts: [{ file: 0, label: "Revenue by region", desc: "Bars", insight: "i1" }],
  questionAnswers: [{ id: "q1", question: "Which region?", answer: "North", answerable: true }],
  facts: { rowCount: 1200, language: "en" },
});

type Entry = { version: number; byDig?: boolean; byYou?: boolean; byName?: string | null; kind?: string };
const entry = ({ version, byDig = false, byYou = true, byName = null, kind = "edited" }: Entry) =>
  ({ version, kind, restoredFrom: null, createdAt: "2026-11-21T10:00:00Z", byDig, byYou, byName });

const opened = (over: Record<string, unknown> = {}) => ({
  editable: true, canEdit: true, version: 1, document: doc(), warnings: [],
  versions: [entry({ version: 1, byDig: true, byYou: false, kind: "written" })], pictures: {}, ...over,
});

let getReport: ReturnType<typeof vi.fn>;
let saveReport: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getReport = vi.fn().mockResolvedValue(opened());
  saveReport = vi.fn();
  const api = BackendAPI as unknown as Record<string, unknown>;
  api.getReport = getReport;
  api.saveReport = saveReport;
  api.restoreReport = vi.fn();
});

async function openEditor(button = "Edit the report") {
  const user = userEvent.setup();
  render(<ReportEditor analysis={{ id: "a1" }} ready />);
  await user.click(screen.getByRole("button", { name: button }));
  await screen.findByRole("textbox", { name: "Report title" });
  return user;
}

const title = () => screen.getByRole("textbox", { name: "Report title" }) as HTMLInputElement;

// ── Viewers ───────────────────────────────────────────────────────────────────

describe("a viewer", () => {
  beforeEach(() => {
    getReport.mockResolvedValue(opened({
      canEdit: false, version: 2,
      versions: [entry({ version: 1, byDig: true, byYou: false }), entry({ version: 2, byYou: false, byName: "sara" })],
    }));
  });

  it("reads the report but cannot change a word of it", async () => {
    await openEditor();

    expect(screen.getByRole("heading", { name: "The report" })).toBeInTheDocument();
    expect(title()).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Insight 1 text" })).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: "Shown under" })).toBeDisabled();
    for (const name of ["Save", "Discard changes", /Undo/, /Move up/, /Remove/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("sees every version and who saved it, with no way to go back", async () => {
    const user = await openEditor();

    await user.click(screen.getByRole("button", { name: "Versions (2)" }));

    expect(screen.getByText(/Saved by sara/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Go back to this/ })).not.toBeInTheDocument();
  });
});

// ── Who saved ─────────────────────────────────────────────────────────────────

describe("who saved each version", () => {
  it("names teammates, says you for your own, and never guesses a name", async () => {
    getReport.mockResolvedValue(opened({
      version: 4,
      versions: [entry({ version: 1, byDig: true, byYou: false }), entry({ version: 2 }),
                 entry({ version: 3, byYou: false, byName: null }), entry({ version: 4, byYou: false, byName: "sara" })],
    }));
    const user = await openEditor();

    await user.click(screen.getByRole("button", { name: "Versions (4)" }));

    expect(screen.getByText(/Written by DIG/)).toBeInTheDocument();
    expect(screen.getByText(/Saved by you/)).toBeInTheDocument();
    expect(screen.getByText(/Saved by a teammate/)).toBeInTheDocument();
    expect(screen.getByText(/Saved by sara/)).toBeInTheDocument();
  });

  it("says whose change Undo takes back", async () => {
    getReport.mockResolvedValue(opened({
      version: 2, versions: [entry({ version: 1, byDig: true, byYou: false }), entry({ version: 2, byYou: false, byName: "sara" })],
    }));
    await openEditor();

    expect(screen.getByRole("button", { name: "↶ Undo sara's change" })).toBeEnabled();
  });
});

// ── Saving while a teammate saved ─────────────────────────────────────────────

describe("saving while a teammate saved", () => {
  it("says the save was combined with the teammate's changes", async () => {
    saveReport.mockResolvedValue(opened({
      version: 3, document: doc("Mine"),
      combinedWith: [{ name: "sara", byYou: false, byDig: false }],
    }));
    const user = await openEditor();

    await user.clear(title());
    await user.type(title(), "Mine");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status"))
      .toHaveTextContent("Saved as version 3, together with the changes sara saved meanwhile.");
  });

  it("names the part both changed and who, and keeps the person's words", async () => {
    saveReport.mockRejectedValue(Object.assign(new Error("x"), {
      status: 409, code: "SAME_PART_CHANGED",
      parts: [{ section: "insight", id: "i2", field: "body" }, { section: "reportTitle" }],
      savedBy: [{ name: "sara", byYou: false, byDig: false }],
    }));
    const user = await openEditor();

    await user.clear(title());
    await user.type(title(), "Mine");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Sara changed the same part since you opened it: Insight 2 text, Report title. Your changes are still here");
    expect(title()).toHaveValue("Mine");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("tells a viewer, should the server refuse, that only editors change the report", async () => {
    saveReport.mockRejectedValue(Object.assign(new Error("x"), { status: 403, code: "READ_ONLY" }));
    const user = await openEditor();

    await user.type(title(), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ask the team owner to make you an editor");
  });
});

// ── A teammate's save, as it happens ──────────────────────────────────────────

describe("a teammate's save, as it happens", () => {
  it("listens only while the report is open", async () => {
    render(<ReportEditor analysis={{ id: "a1" }} ready />);
    expect(live().active).toBe(false);

    await userEvent.setup().click(screen.getByRole("button", { name: "Edit the report" }));
    await screen.findByRole("textbox", { name: "Report title" });
    expect(live().active).toBe(true);
  });

  it("shows the new version at once when nothing is unsaved", async () => {
    await openEditor();
    getReport.mockResolvedValue(opened({ version: 2, document: doc("Sara's title") }));

    act(() => live().onSaved({ analysisId: "a1", version: 2, savedBy: "sara-id", savedByName: "sara" }));

    await waitFor(() => expect(title()).toHaveValue("Sara's title"));
    expect(screen.getByRole("status")).toHaveTextContent("Sara saved version 2. You're looking at it now.");
  });

  it("keeps unsaved words and says the next save combines them", async () => {
    const user = await openEditor();
    await user.clear(title());
    await user.type(title(), "Half typed");
    getReport.mockClear();

    act(() => live().onSaved({ analysisId: "a1", version: 2, savedBy: "sara-id", savedByName: "sara" }));

    expect(await screen.findByRole("status"))
      .toHaveTextContent("Sara saved version 2. When you save, your changes are combined with theirs.");
    expect(title()).toHaveValue("Half typed");
    expect(getReport).not.toHaveBeenCalled();
  });

  it("does not throw away words typed while the new version was on its way", async () => {
    const user = await openEditor();
    let answer: (v: unknown) => void = () => {};
    getReport.mockReturnValue(new Promise(resolve => { answer = resolve; }));

    act(() => live().onSaved({ analysisId: "a1", version: 2, savedBy: "sara-id", savedByName: "sara" }));
    await user.type(title(), " and more");
    await act(async () => answer(opened({ version: 2, document: doc("Sara's title") })));

    expect(title()).toHaveValue("Sales in 2025 and more");
  });

  it("ignores the echo of a version it already has", async () => {
    await openEditor();
    getReport.mockClear();

    act(() => live().onSaved({ analysisId: "a1", version: 1, savedBy: "me", savedByName: "me" }));

    expect(getReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says when the save came from this person's other tab", async () => {
    await openEditor();
    getReport.mockResolvedValue(opened({ version: 2, document: doc("From my other tab") }));

    act(() => live().onSaved({ analysisId: "a1", version: 2, savedBy: "ME", savedByName: "me" }));

    expect(await screen.findByRole("status")).toHaveTextContent("You (in another tab) saved version 2.");
  });

  it("calls an unnamed teammate a teammate", async () => {
    await openEditor();
    getReport.mockResolvedValue(opened({ version: 2 }));

    act(() => live().onSaved({ analysisId: "a1", version: 2, savedBy: "x", savedByName: null }));

    expect(await screen.findByRole("status")).toHaveTextContent("A teammate saved version 2.");
  });

  it("closes the report when it is no longer shared with this person", async () => {
    await openEditor();

    act(() => live().onRemoved());

    expect(screen.getByRole("alert")).toHaveTextContent("You can no longer open this report");
    expect(screen.queryByRole("textbox", { name: "Report title" })).not.toBeInTheDocument();
  });

  it("catches up after the connection comes back", async () => {
    await openEditor();
    getReport.mockResolvedValue(opened({ version: 3, document: doc("Missed while offline") }));

    act(() => live().onReconnected());

    await waitFor(() => expect(title()).toHaveValue("Missed while offline"));
  });
});

// ── Naming parts and people ───────────────────────────────────────────────────

describe("naming the parts and the people", () => {
  const t = {
    reportTitle: "Report title", conclusion: "Conclusion", insights: "Insights",
    insightTitle: (n: number) => `Insight ${n} title`, insightBody: (n: number) => `Insight ${n} text`,
    insightOrder: "the order of the insights", chartOrder: "the order of the charts",
    chartTitle: "Chart title", chartCaption: "Chart caption", shownUnder: "Shown under",
    answers: "Answers", answerTo: (q: string) => `Answer to: ${q}`,
    youElsewhere: "you (in another tab)", aTeammate: "a teammate", and: ", ",
  };

  it("names each part as the editor labels it", () => {
    const d = doc();
    expect(describePart({ section: "conclusion" }, d, t)).toBe("Conclusion");
    expect(describePart({ section: "insight", id: "i2", field: "title" }, d, t)).toBe("Insight 2 title");
    expect(describePart({ section: "insight", id: "gone", field: "body" }, d, t)).toBe("Insights");
    expect(describePart({ section: "insightOrder" }, d, t)).toBe("the order of the insights");
    expect(describePart({ section: "chart", file: 0, field: "desc" }, d, t)).toBe("Chart caption (Revenue by region)");
    expect(describePart({ section: "answer", id: "q1" }, d, t)).toBe("Answer to: Which region?");
  });

  it("names who saved, each once, and DIG as DIG", () => {
    expect(whoSaved([{ name: "sara" }, { byYou: true }, { byDig: true }, { name: null }], t))
      .toBe("sara, you (in another tab), DIG, a teammate");
  });
});
