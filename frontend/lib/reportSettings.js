/**
 * The report settings a Pro user chooses before an analysis.
 *
 * Every key here is read by AnalysisService.BuildPythonRequest. The limits
 * match ai_engine/llm/harness.py, so what the panel lets a user type is what
 * the report receives, rather than being cut short on the way.
 */

export const MIN_INSIGHTS = 1;
export const MAX_INSIGHTS = 10;
export const MAX_QUESTIONS = 5;
export const MAX_MUST_MENTION = 8;
export const MAX_BRIEF_CHARS = 1500;
export const MAX_ASK_CHARS = 600;

export const TEXT_LIMITS = {
  focusOn: 300,
  comparisons: 200,
  assumptions: 500,
  avoid: 200,
  question: 300,
  note: 300,
};

export const DEFAULT_SETTINGS = {
  // Language & voice
  language: "en",
  tone: "professional",
  audience: "general",
  writingFormat: "narrative",
  // Depth & scope
  depth: "standard",
  insightsCount: 5,
  occasion: "general",
  // What the report is about
  focusOn: "",
  comparisons: "",
  assumptions: "",
  avoid: "",
  mustMention: /** @type {string[]} */ ([]),
  questions: /** @type {{ question: string, note: string }[]} */ ([]),
  // Visual preferences
  chartStyle: "mixed",
  // Section toggles
  includeMethodology: true,
  includeConfidence: true,
  // Output formats. The PDF is always made.
  outputFormat: { pdf: true, word: false, pptx: false },
};

/**
 * The panel after a brief. Only what the brief set changes, so a brief that
 * mentions tone alone leaves the user's other choices as they were. Word or
 * PowerPoint already switched on stays on: a brief adds a file, never drops one.
 *
 * @param {typeof DEFAULT_SETTINGS} current
 * @param {Record<string, any> | null | undefined} settings
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function applyBrief(current, settings) {
  const next = { ...current };
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (!(key in DEFAULT_SETTINGS) || value === null || value === undefined) continue;
    if (key === "outputFormat") {
      next.outputFormat = {
        ...current.outputFormat,
        word: current.outputFormat.word || value.word === true,
        pptx: current.outputFormat.pptx || value.pptx === true,
      };
    } else if (key === "questions") {
      next.questions = (Array.isArray(value) ? value : [])
        .map((q) => ({ question: String(q?.question ?? ""), note: String(q?.note ?? "") }))
        .filter((q) => q.question.trim())
        .slice(0, MAX_QUESTIONS);
    } else {
      /** @type {Record<string, any>} */ (next)[key] = value;
    }
  }
  return next;
}

/**
 * How many things the user asked the report to do, for the panel's badge.
 * @param {typeof DEFAULT_SETTINGS} opts
 * @returns {number}
 */
export function directiveCount(opts) {
  return [opts.focusOn, opts.comparisons, opts.assumptions, opts.avoid].filter((text) => text?.trim()).length
    + opts.mustMention.length
    + opts.questions.filter((q) => q.question.trim()).length;
}
