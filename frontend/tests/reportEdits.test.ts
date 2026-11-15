import { describe, expect, it } from "vitest";
import {
  canRemoveInsight, chartFileOf, chartsUnder, editOf, moveInsight, removeChart, removeInsight,
  sameDocument, setAnswer, setChart, setInsight, setText, undoTarget, warningsAt,
  type ReportDocument, type VersionEntry,
} from "@/lib/reportEdits";

/** The edits the Report editor makes to a report document. */

const doc = (): ReportDocument => ({
  schema: 1,
  text: {
    reportTitle: "Sales in 2025", introduction: "Intro", executiveSummary: "Summary",
    conclusion: "End", dataQualitySection: "Clean", assumptions: "",
  },
  insights: [
    { id: "i1", title: "North leads", body: "North sold 120.", basedOn: ["Revenue by region"] },
    { id: "i2", title: "Q4 dips", body: "Sales fell.", basedOn: [] },
    { id: "i3", title: "Returns are rare", body: "Few returns.", basedOn: [] },
  ],
  charts: [
    { file: 0, label: "Revenue by region", desc: "Bars", insight: "i1", type: "bar", color: "#fff" },
    { file: 1, label: "Monthly sales", desc: "Line", insight: null },
  ],
  questionAnswers: [{ id: "q1", question: "Which region?", answer: "North", answerable: true }],
  facts: { rowCount: 1200, language: "en" },
});

describe("every edit", () => {
  it("returns a new document and leaves the one given alone", () => {
    const before = doc();
    const copy = JSON.stringify(before);

    setText(before, "conclusion", "x");
    setInsight(before, "i1", "title", "x");
    moveInsight(before, "i1", 1);
    removeInsight(before, "i1");
    setChart(before, 0, { label: "x" });
    removeChart(before, 0);
    setAnswer(before, "q1", "x");

    expect(JSON.stringify(before)).toBe(copy);
  });
});

describe("insights", () => {
  it("change only the one named", () => {
    const after = setInsight(doc(), "i2", "body", "Sales fell by a third.");
    expect(after.insights.map(i => i.body)).toEqual(["North sold 120.", "Sales fell by a third.", "Few returns."]);
  });

  it("move up and down, and not past either end", () => {
    expect(moveInsight(doc(), "i2", -1).insights.map(i => i.id)).toEqual(["i2", "i1", "i3"]);
    expect(moveInsight(doc(), "i2", 1).insights.map(i => i.id)).toEqual(["i1", "i3", "i2"]);
    expect(moveInsight(doc(), "i1", -1).insights.map(i => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(moveInsight(doc(), "i3", 1).insights.map(i => i.id)).toEqual(["i1", "i2", "i3"]);
  });

  it("removed leave their charts at the end of the report", () => {
    const after = removeInsight(doc(), "i1");
    expect(after.insights.map(i => i.id)).toEqual(["i2", "i3"]);
    expect(after.charts.find(c => c.file === 0)?.insight).toBeNull();
    expect(chartsUnder(after, null).map(c => c.file)).toEqual([0, 1]);
  });

  it("cannot all be removed: a report keeps one", () => {
    const one = removeInsight(removeInsight(doc(), "i1"), "i2");
    expect(canRemoveInsight(one)).toBe(false);
    expect(removeInsight(one, "i3").insights.map(i => i.id)).toEqual(["i3"]);
  });
});

describe("charts", () => {
  it("take a new title, caption and place", () => {
    const after = setChart(doc(), 1, { label: "Sales by month", desc: "One line", insight: "i2" });
    expect(after.charts[1]).toMatchObject({ file: 1, label: "Sales by month", desc: "One line", insight: "i2" });
    expect(chartsUnder(after, "i2").map(c => c.file)).toEqual([1]);
    expect(chartsUnder(after, null)).toEqual([]);
  });

  it("can be removed", () => {
    expect(removeChart(doc(), 0).charts.map(c => c.file)).toEqual([1]);
  });
});

describe("what a save sends", () => {
  it("is only what a person can change", () => {
    const sent = editOf(setAnswer(doc(), "q1", "The North"));

    expect(sent).toEqual({
      schema: 1,
      text: doc().text,
      insights: [
        { id: "i1", title: "North leads", body: "North sold 120." },
        { id: "i2", title: "Q4 dips", body: "Sales fell." },
        { id: "i3", title: "Returns are rare", body: "Few returns." },
      ],
      charts: [
        { file: 0, label: "Revenue by region", desc: "Bars", insight: "i1" },
        { file: 1, label: "Monthly sales", desc: "Line", insight: null },
      ],
      questionAnswers: [{ id: "q1", answer: "The North" }],
    });
    // What DIG measured never leaves the page: the server keeps its own copy.
    expect(JSON.stringify(sent)).not.toContain("Revenue by region\"]");
    expect(sent).not.toHaveProperty("facts");
  });

  it("is unchanged until something is changed", () => {
    expect(sameDocument(doc(), doc())).toBe(true);
    expect(sameDocument(doc(), setText(doc(), "conclusion", "End."))).toBe(false);
  });
});

describe("warnings about figures", () => {
  const warnings = [
    { section: "insight", id: "i1", field: "body", numbers: ["450"] },
    { section: "insight", id: "i2", field: "body", numbers: ["9"] },
    { section: "chart", file: 0, field: "desc", numbers: ["3.5"] },
    { section: "conclusion", numbers: ["12", "13"] },
  ];

  it("are found where they point", () => {
    expect(warningsAt(warnings, { section: "insight", id: "i1", field: "body" })).toEqual(["450"]);
    expect(warningsAt(warnings, { section: "insight", id: "i1", field: "title" })).toEqual([]);
    expect(warningsAt(warnings, { section: "chart", file: 0, field: "desc" })).toEqual(["3.5"]);
    expect(warningsAt(warnings, { section: "conclusion" })).toEqual(["12", "13"]);
    expect(warningsAt(null, { section: "conclusion" })).toEqual([]);
  });
});

describe("Undo", () => {
  const v = (version: number): VersionEntry => ({ version, kind: "edited", createdAt: "", byDig: false });

  it("goes back to the newest kept version before this one", () => {
    expect(undoTarget([v(1), v(2), v(3)], 3)).toBe(2);
    // Old versions were trimmed: 2 to 5 are gone.
    expect(undoTarget([v(1), v(6), v(7)], 6)).toBe(1);
  });

  it("has nowhere to go from the first version", () => {
    expect(undoTarget([v(1)], 1)).toBeNull();
  });
});

describe("chart pictures", () => {
  it("are matched by the file number in their link", () => {
    expect(chartFileOf("https://x.supabase.co/storage/v1/u/a/chart_3.png?token=abc")).toBe(3);
    expect(chartFileOf("https://x/report.pdf")).toBeNull();
    expect(chartFileOf(undefined)).toBeNull();
  });
});
