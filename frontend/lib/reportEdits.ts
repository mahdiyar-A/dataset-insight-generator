/**
 * Changes to a report document, as the Report editor makes them.
 *
 * The document's shape is the AI service's (ai_engine/report_document.py).
 * Only what a person may change is touched here; the server applies an edit
 * to the original again, so anything else sent would be ignored anyway.
 * Every function returns a new document and leaves the one given alone.
 */

export type TextField =
  | "reportTitle" | "introduction" | "executiveSummary"
  | "conclusion" | "dataQualitySection" | "assumptions";

export interface ReportInsight {
  id: string;
  title: string;
  body: string;
  restsOn?: string[];
  basedOn?: string[];
}

export interface ReportChart {
  file: number;
  type?: string;
  label: string;
  desc: string;
  color?: string;
  insight: string | null;
}

export interface ReportAnswer {
  id: string;
  question: string;
  answer: string;
  answerable?: boolean;
}

export interface ReportDocument {
  schema: number;
  text: Record<TextField, string>;
  insights: ReportInsight[];
  charts: ReportChart[];
  questionAnswers: ReportAnswer[];
  facts: Record<string, unknown>;
}

/** Where a warning about a figure points, as the server reports it. */
export interface FigureWarning {
  section: string;
  id?: string;
  file?: number;
  field?: string;
  numbers: string[];
}

export interface VersionEntry {
  version: number;
  kind: "written" | "edited" | "restored";
  restoredFrom?: number | null;
  createdAt: string;
  byDig: boolean;
}

export function setText(doc: ReportDocument, field: TextField, value: string): ReportDocument {
  return { ...doc, text: { ...doc.text, [field]: value } };
}

export function setInsight(doc: ReportDocument, id: string, field: "title" | "body", value: string): ReportDocument {
  return { ...doc, insights: doc.insights.map(i => (i.id === id ? { ...i, [field]: value } : i)) };
}

/** Moves an insight up (-1) or down (+1). Its charts go with it. */
export function moveInsight(doc: ReportDocument, id: string, step: -1 | 1): ReportDocument {
  const from = doc.insights.findIndex(i => i.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= doc.insights.length) return doc;
  const insights = doc.insights.slice();
  [insights[from], insights[to]] = [insights[to], insights[from]];
  return { ...doc, insights };
}

/**
 * Removes an insight. Its charts join the other charts at the end of the
 * report. The last insight cannot be removed: a report needs one.
 */
export function removeInsight(doc: ReportDocument, id: string): ReportDocument {
  if (doc.insights.length <= 1 || !doc.insights.some(i => i.id === id)) return doc;
  return {
    ...doc,
    insights: doc.insights.filter(i => i.id !== id),
    charts: doc.charts.map(c => (c.insight === id ? { ...c, insight: null } : c)),
  };
}

export function canRemoveInsight(doc: ReportDocument): boolean {
  return doc.insights.length > 1;
}

export function setChart(
  doc: ReportDocument, file: number, patch: Partial<Pick<ReportChart, "label" | "desc" | "insight">>,
): ReportDocument {
  return { ...doc, charts: doc.charts.map(c => (c.file === file ? { ...c, ...patch } : c)) };
}

export function removeChart(doc: ReportDocument, file: number): ReportDocument {
  return { ...doc, charts: doc.charts.filter(c => c.file !== file) };
}

export function setAnswer(doc: ReportDocument, id: string, value: string): ReportDocument {
  return {
    ...doc,
    questionAnswers: doc.questionAnswers.map(qa => (qa.id === id ? { ...qa, answer: value } : qa)),
  };
}

/** The charts shown under an insight, or, with null, the ones under none. */
export function chartsUnder(doc: ReportDocument, insight: string | null): ReportChart[] {
  return doc.charts.filter(c => (c.insight ?? null) === insight);
}

export function sameDocument(a: ReportDocument | null, b: ReportDocument | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What a save sends: the parts a person can change. Fixed parts stay on the
 * server, which never takes them from an edit.
 */
export function editOf(doc: ReportDocument) {
  return {
    schema: doc.schema,
    text: doc.text,
    insights: doc.insights.map(({ id, title, body }) => ({ id, title, body })),
    charts: doc.charts.map(({ file, label, desc, insight }) => ({ file, label, desc, insight })),
    questionAnswers: doc.questionAnswers.map(({ id, answer }) => ({ id, answer })),
  };
}

/** The figures warned about in one place of the report, or none. */
export function warningsAt(
  warnings: FigureWarning[] | null | undefined,
  where: { section: string; id?: string; file?: number; field?: string },
): string[] {
  return (warnings ?? [])
    .filter(w => w.section === where.section
      && (where.id === undefined || w.id === where.id)
      && (where.file === undefined || w.file === where.file)
      && (where.field === undefined || w.field === where.field))
    .flatMap(w => w.numbers);
}

/**
 * The version Undo goes back to: the one before the newest that is still
 * kept. Null when the newest is the only one.
 */
export function undoTarget(versions: VersionEntry[], current: number): number | null {
  const older = versions.map(v => v.version).filter(v => v < current).sort((a, b) => b - a);
  return older[0] ?? null;
}

/** A chart's file number, read from the signed link of its picture. */
export function chartFileOf(url: string | null | undefined): number | null {
  const match = /chart_(\d+)\.png/.exec(url ?? "");
  return match ? Number(match[1]) : null;
}

export const RTL_LANGUAGES = new Set(["fa", "ar"]);
