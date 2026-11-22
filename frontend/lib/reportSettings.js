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

/**
 * The five looks a report can be made in, with the colours
 * ai_engine/design/looks.py draws them in, so the panel's little pages match
 * the files. "heavy" is DIG's own way: thick ink rules and offset shadows.
 */
export const THEMES = {
  signature: { paper: "#F2EFE9", ink: "#12121A", accent: "#2536E0", mark: "#D6F24A", heavy: true },
  clean:     { paper: "#FFFFFF", ink: "#1E293B", accent: "#0F766E", mark: "#CCFBF1", heavy: false },
  warm:      { paper: "#FBF6EE", ink: "#2B1D14", accent: "#B5532E", mark: "#F3D9A4", heavy: false },
  classic:   { paper: "#FFFFFF", ink: "#14213D", accent: "#7A1F2B", mark: "#EFE6D2", heavy: false },
  midnight:  { paper: "#111318", ink: "#F4F1EA", accent: "#D6F24A", mark: "#2536E0", heavy: true },
};

/** Font pairs, and the type each is shown in on the panel. */
export const FONTS = {
  auto:      "inherit",
  signature: 'var(--font-display), "Bricolage Grotesque", sans-serif',
  modern:    'var(--font-sans), "Work Sans", sans-serif',
  classic:   'Georgia, "Times New Roman", serif',
  storybook: 'Georgia, "Times New Roman", serif',
  technical: 'Consolas, "SFMono-Regular", Menlo, monospace',
};

export const PAGE_SIZES = ["a4", "letter"];

export const DEFAULT_SETTINGS = {
  // How the files look. "auto" lets DIG pick the theme that fits the data;
  // the font follows the theme unless one is chosen.
  theme: "auto",
  font: "auto",
  pageSize: "a4",
  // Language & voice. "auto" means DIG reads the data for who the report is
  // for: a reading log is written for its owner, a lab's data for a scientist.
  language: "en",
  tone: "auto",
  audience: "auto",
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
 * Whether a brief's value is one the panel can show. A theme, font or page
 * size the panel has no card for would leave it showing nothing chosen.
 *
 * @param {string} key
 * @param {any} value
 */
function allowed(key, value) {
  if (key === "theme") return value === "auto" || value in THEMES;
  if (key === "font") return value in FONTS;
  if (key === "pageSize") return PAGE_SIZES.includes(value);
  return true;
}

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
    } else if (!allowed(key, value)) {
      continue;
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
