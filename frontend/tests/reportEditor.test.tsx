import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportEditor from "@/components/ReportEditor";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The Report editor on the dashboard: the owner changes the words, the order
 * of the insights and the charts, saves new versions and goes back to old
 * ones. What DIG measured stays as it was.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const doc = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  text: {
    reportTitle: "Sales in 2025", introduction: "Intro", executiveSummary: "Summary",
    conclusion: "End", dataQualitySection: "Clean", assumptions: "",
  },
  insights: [
    { id: "i1", title: "North leads", body: "North sold 120.", basedOn: ["Revenue by region: North 120"] },
    { id: "i2", title: "Q4 dips", body: "Sales fell.", basedOn: [] },
  ],
  charts: [
    { file: 0, label: "Revenue by region", desc: "Bars", insight: "i1" },
    { file: 1, label: "Monthly sales", desc: "Line", insight: null },
  ],
  questionAnswers: [{ id: "q1", question: "Which region?", answer: "North", answerable: true }],
  facts: { rowCount: 1200, columnCount: 8, confidenceScore: 8, language: "en" },
  ...over,
});

const entry = (version: number, kind = "edited", restoredFrom: number | null = null) =>
  ({ version, kind, restoredFrom, createdAt: "2026-11-15T10:00:00Z", byDig: kind === "written" });

const opened = (version = 1, document = doc(), versions = [entry(1, "written")], warnings: unknown[] = []) =>
  ({ editable: true, version, document, warnings, versions });

const fail = (status: number, code: string | null = null) =>
  Object.assign(new Error("server words"), { status, code });

let getReport: ReturnType<typeof vi.fn>;
let saveReport: ReturnType<typeof vi.fn>;
let restoreReport: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getReport = vi.fn().mockResolvedValue(opened());
  saveReport = vi.fn();
  restoreReport = vi.fn();
  BackendAPI.getReport = getReport as unknown as typeof BackendAPI.getReport;
  BackendAPI.saveReport = saveReport as unknown as typeof BackendAPI.saveReport;
  BackendAPI.restoreReport = restoreReport as unknown as typeof BackendAPI.restoreReport;
  BackendAPI.getVisualizations = vi.fn().mockResolvedValue([
    { url: "https://signed.example/u/a1/chart_0.png?token=t" },
  ]) as unknown as typeof BackendAPI.getVisualizations;
});

const analysis = { id: "a1" };

async function openEditor() {
  const user = userEvent.setup();
  render(<ReportEditor analysis={analysis} ready />);
  await user.click(screen.getByRole("button", { name: "Edit the report" }));
  await screen.findByRole("textbox", { name: "Report title" });
  return user;
}

const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("opening the report", () => {
  it("shows nothing until the analysis has its report", () => {
    const { container } = render(<ReportEditor analysis={analysis} ready={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks the server only when the owner opens the editor", async () => {
    render(<ReportEditor analysis={analysis} ready />);
    expect(getReport).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Edit the report" }));

    await screen.findByRole("textbox", { name: "Report title" });
    expect(getReport).toHaveBeenCalledWith("tok", "a1");
    expect(screen.getByText("Version 1")).toBeInTheDocument();
  });

  it("tells the owner an older report must be run again to be edited", async () => {
    getReport.mockResolvedValue({ editable: false });
    render(<ReportEditor analysis={analysis} ready />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Edit the report" }));

    expect(await screen.findByText(/Run the analysis again to edit it/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers to try again when the report can't be opened", async () => {
    getReport.mockRejectedValueOnce(fail(500));
    const user = userEvent.setup();
    render(<ReportEditor analysis={analysis} ready />);
    await user.click(screen.getByRole("button", { name: "Edit the report" }));

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await screen.findByRole("textbox", { name: "Report title" });
    expect(getReport).toHaveBeenCalledTimes(2);
  });

  it("shows each chart's picture beside its words", async () => {
    await openEditor();
    const picture = await screen.findByRole("img", { name: "Revenue by region" });
    expect(picture).toHaveAttribute("src", "https://signed.example/u/a1/chart_0.png?token=t");
  });
});

describe("what can and cannot be changed", () => {
  it("shows what an insight rests on without a box to change it", async () => {
    await openEditor();

    expect(screen.getByText("Revenue by region: North 120")).toBeInTheDocument();
    for (const box of screen.getAllByRole("textbox")) {
      expect((box as HTMLInputElement).value).not.toContain("North 120");
    }
    expect(screen.getByText(/1,200 rows · 8 columns · confidence 8\/10/)).toBeInTheDocument();
  });

  it("keeps Remove off the last insight", async () => {
    const user = await openEditor();

    await user.click(screen.getByRole("button", { name: "Remove: Insight 1" }));

    expect(screen.getByRole("button", { name: "Remove: Insight 1" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "Insight 2 title" })).not.toBeInTheDocument();
  });

  it("moves a removed insight's chart to the end of the report", async () => {
    const user = await openEditor();

    await user.click(screen.getByRole("button", { name: "Remove: Insight 1" }));

    const others = screen.getByText("Other charts").parentElement!;
    expect(within(others).getAllByRole("textbox", { name: "Chart title" }).map(b => (b as HTMLInputElement).value))
      .toEqual(["Revenue by region", "Monthly sales"]);
  });
});

describe("saving", () => {
  it("is off until something changes, and Discard brings the saved words back", async () => {
    const user = await openEditor();
    expect(saveButton()).toBeDisabled();

    const title = screen.getByRole("textbox", { name: "Report title" });
    await user.clear(title);
    await user.type(title, "Sales, 2025");
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(title).toHaveValue("Sales in 2025");
    expect(saveButton()).toBeDisabled();
  });

  it("sends the edit made to the version that was open, and shows the new version", async () => {
    const user = await openEditor();
    const edited = doc();
    edited.insights = [edited.insights[1], { ...edited.insights[0], body: "North sold 450." }];
    saveReport.mockResolvedValue(opened(2, edited, [entry(1, "written"), entry(2)],
      [{ section: "insight", id: "i1", field: "body", numbers: ["450"] }]));

    const body = screen.getByRole("textbox", { name: "Insight 1 text" });
    await user.clear(body);
    await user.type(body, "North sold 450.");
    await user.click(screen.getByRole("button", { name: "Move down: Insight 1" }));
    await user.click(saveButton());

    expect(saveReport).toHaveBeenCalledTimes(1);
    const [token, id, baseVersion, sent] = saveReport.mock.calls[0];
    expect([token, id, baseVersion]).toEqual(["tok", "a1", 1]);
    expect(sent.insights).toEqual([
      { id: "i2", title: "Q4 dips", body: "Sales fell." },
      { id: "i1", title: "North leads", body: "North sold 450." },
    ]);
    expect(sent).not.toHaveProperty("facts");

    expect(await screen.findByText("Saved as version 2. The files now match it.")).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("warns beside a figure the analysis didn't produce, without stopping the save", async () => {
    const user = await openEditor();
    saveReport.mockResolvedValue(opened(2, doc({ text: { ...doc().text, conclusion: "Up 37%." } }),
      [entry(1, "written"), entry(2)], [{ section: "conclusion", numbers: ["37"] }]));

    const conclusion = screen.getByRole("textbox", { name: "Conclusion" });
    await user.clear(conclusion);
    await user.type(conclusion, "Up 37%.");
    await user.click(saveButton());

    const warning = await screen.findByRole("note");
    expect(warning).toHaveTextContent("37: not a figure the analysis produced");
    expect(conclusion.closest("label")).toContainElement(warning);
  });

  it("sends a chart moved under another insight", async () => {
    const user = await openEditor();
    saveReport.mockResolvedValue(opened(2, doc(), [entry(1, "written"), entry(2)]));
    const others = screen.getByText("Other charts").parentElement!;

    await user.selectOptions(within(others).getByRole("combobox", { name: "Shown under" }), "i2");
    await user.click(saveButton());

    const sent = saveReport.mock.calls[0][3];
    expect(sent.charts).toContainEqual({ file: 1, label: "Monthly sales", desc: "Line", insight: "i2" });
  });

  it("says when the report changed in another tab, and Reload opens the newest", async () => {
    const user = await openEditor();
    saveReport.mockRejectedValue(fail(409, "CHANGED_SINCE_OPENED"));
    await user.type(screen.getByRole("textbox", { name: "Conclusion" }), "!");

    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed since you opened it/);
    getReport.mockResolvedValue(opened(3, doc({ text: { ...doc().text, conclusion: "Theirs" } }),
      [entry(1, "written"), entry(3)]));
    await user.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Conclusion" })).toHaveValue("Theirs"));
    expect(screen.getByText("Version 3")).toBeInTheDocument();
  });

  it("keeps the changes when the server can't save just now", async () => {
    const user = await openEditor();
    saveReport.mockRejectedValue(fail(503, "UNAVAILABLE"));
    await user.type(screen.getByRole("textbox", { name: "Conclusion" }), " Mine.");

    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/Your changes are still here/);
    expect(screen.getByRole("textbox", { name: "Conclusion" })).toHaveValue("End Mine.");
    expect(saveButton()).toBeEnabled();
  });

  it("explains when the server refuses a report with no insights", async () => {
    const user = await openEditor();
    saveReport.mockRejectedValue(fail(422, "no_insights"));
    await user.type(screen.getByRole("textbox", { name: "Conclusion" }), "!");

    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("A report keeps at least one insight.");
  });

  it("asks before the page is left with unsaved changes", async () => {
    const user = await openEditor();
    const leave = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);

    await user.type(screen.getByRole("textbox", { name: "Conclusion" }), "!");

    expect(leave()).toBe(true);
  });
});

describe("going back", () => {
  const three = () => opened(3, doc(), [entry(1, "written"), entry(2), entry(3)]);

  it("Undo goes back to the version before, saved again as the newest", async () => {
    getReport.mockResolvedValue(three());
    const user = await openEditor();
    restoreReport.mockResolvedValue(opened(4, doc(), [entry(1, "written"), entry(2), entry(3), entry(4, "restored", 2)]));

    await user.click(screen.getByRole("button", { name: /Undo/ }));

    expect(restoreReport).toHaveBeenCalledWith("tok", "a1", 3, 2);
    expect(await screen.findByText("Went back to version 2, saved as version 4.")).toBeInTheDocument();
  });

  it("Undo waits until unsaved changes are saved or discarded", async () => {
    getReport.mockResolvedValue(three());
    const user = await openEditor();

    await user.type(screen.getByRole("textbox", { name: "Conclusion" }), "!");

    expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
  });

  it("there is no Undo on the version DIG wrote", async () => {
    await openEditor();
    expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
  });

  it("the version list goes back to any kept version", async () => {
    getReport.mockResolvedValue(three());
    const user = await openEditor();
    restoreReport.mockResolvedValue(opened(4, doc(), [entry(1, "written"), entry(2), entry(3), entry(4, "restored", 1)]));

    await user.click(screen.getByRole("button", { name: "Versions (3)" }));
    const list = screen.getByRole("list", { name: "Versions" });
    expect(within(list).getByText("Current")).toBeInTheDocument();
    expect(within(list).getByText(/Written by DIG/)).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Go back to this: Version 1" }));

    expect(restoreReport).toHaveBeenCalledWith("tok", "a1", 3, 1);
    expect(await within(screen.getByRole("list", { name: "Versions" }))
      .findByText(/went back to version 1/)).toBeInTheDocument();
  });
});

describe("right-to-left reports", () => {
  it("are edited right to left", async () => {
    getReport.mockResolvedValue(opened(1, doc({ facts: { language: "fa" } })));
    await openEditor();

    expect(screen.getByRole("textbox", { name: "Report title" })).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("textbox", { name: "Insight 1 text" })).toHaveAttribute("dir", "rtl");
  });
});
