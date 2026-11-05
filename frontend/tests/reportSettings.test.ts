import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MAX_QUESTIONS, applyBrief, directiveCount } from "@/lib/reportSettings";

/**
 * A brief fills in the panel. The risk is in what it overwrites: a user who set
 * things by hand and then writes a sentence about tone must keep the rest.
 */

describe("applyBrief", () => {
  it("changes only what the brief set", () => {
    const current = { ...DEFAULT_SETTINGS, focusOn: "my focus", insightsCount: 7 };

    const next = applyBrief(current, { tone: "casual" });

    expect(next.tone).toBe("casual");
    expect(next.focusOn).toBe("my focus");
    expect(next.insightsCount).toBe(7);
  });

  it("does not change the settings it was given", () => {
    const current = { ...DEFAULT_SETTINGS };
    applyBrief(current, { tone: "casual", outputFormat: { word: true } });

    expect(current.tone).toBe("professional");
    expect(current.outputFormat.word).toBe(false);
  });

  it("adds Word and PowerPoint, and never drops one the user chose", () => {
    const current = { ...DEFAULT_SETTINGS, outputFormat: { pdf: true, word: true, pptx: false } };

    const next = applyBrief(current, { outputFormat: { pptx: true } });

    expect(next.outputFormat).toEqual({ pdf: true, word: true, pptx: true });
  });

  it("ignores keys the panel does not have", () => {
    const next = applyBrief(DEFAULT_SETTINGS, { sneaky: "x", tone: null });

    expect(next).toEqual(DEFAULT_SETTINGS);
  });

  it("normalises questions, drops blanks and keeps at most five", () => {
    const asked = Array.from({ length: 8 }, (_, i) => ({ question: `Q${i}` }));

    const next = applyBrief(DEFAULT_SETTINGS, { questions: [{ question: "  " }, ...asked] });

    expect(next.questions).toHaveLength(MAX_QUESTIONS);
    expect(next.questions[0]).toEqual({ question: "Q0", note: "" });
  });

  it("survives an empty or missing brief", () => {
    expect(applyBrief(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS);
    expect(applyBrief(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("directiveCount", () => {
  it("counts what the user asked for, not blank fields", () => {
    expect(directiveCount(DEFAULT_SETTINGS)).toBe(0);
    expect(directiveCount({
      ...DEFAULT_SETTINGS,
      focusOn: "churn",
      avoid: "   ",
      mustMention: ["a", "b"],
      questions: [{ question: "Why?", note: "" }, { question: "", note: "" }],
    })).toBe(4);
  });
});
