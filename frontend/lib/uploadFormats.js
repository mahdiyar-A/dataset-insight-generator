/**
 * The data files DIG accepts, as the upload form sees them.
 *
 * The AI service's reader (ai_engine/ingest/loader.py) and the backend
 * (FileFormats.cs) keep their own copies of this list. Tests hold all three
 * together, because a form that offers a file the server refuses is a bug the
 * user only meets after choosing the file.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** How many columns the preview table shows. */
export const PREVIEW_COLUMNS = 10;

export const UPLOAD_EXTENSIONS = [
  ".csv", ".tsv", ".tab", ".txt", ".dat", ".psv",
  ".xlsx", ".xlsm", ".xls", ".ods",
  ".json", ".jsonl", ".ndjson", ".geojson", ".xml",
  ".parquet", ".pq", ".feather", ".arrow", ".ipc", ".orc",
  ".dta", ".sas7bdat", ".xpt", ".sav", ".zsav",
  ".sqlite", ".sqlite3", ".db",
  ".gz", ".bz2", ".xz", ".zip",
];

/** The file input's accept attribute. */
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.join(",");

/**
 * The file's lower-case extension, or "" when it has none.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function extensionOf(name) {
  const trimmed = String(name ?? "").trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 ? trimmed.slice(dot) : "";
}

/**
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isAcceptedFile(name) {
  return UPLOAD_EXTENSIONS.includes(extensionOf(name));
}

/**
 * Whether the browser can preview the file itself while it uploads. Only plain
 * CSV: anything else has to wait for the server's reading of it.
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function canPreviewInBrowser(name) {
  return extensionOf(name) === ".csv";
}

/**
 * The cleaned download's name. Cleaning always produces a CSV, so the name
 * says so whatever came in: "sales.xlsx" gives "cleaned_sales.csv".
 * Mirrors FileFormats.CleanedFileName.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function cleanedFileName(name) {
  const stripOne = (/** @type {string} */ value) => {
    const dot = value.lastIndexOf(".");
    return dot > 0 ? value.slice(0, dot) : value;
  };
  let stem = stripOne(String(name ?? "").trim());
  if (isAcceptedFile(stem)) stem = stripOne(stem); // "orders.csv.gz" → "orders"
  return `cleaned_${stem || "data"}.csv`;
}

/**
 * The preview table from what the server read, or null when it did not read
 * the file (the AI service was busy or down).
 * @param {{ headers?: unknown, preview?: unknown, columnCount?: number } | null | undefined} result
 * @returns {{ headers: string[], rows: string[][], totalCols: number } | null}
 */
export function previewFromUpload(result) {
  const headers = Array.isArray(result?.headers) ? result.headers.map(String) : [];
  if (headers.length === 0) return null;
  const rows = Array.isArray(result?.preview) ? result.preview : [];
  return {
    headers: headers.slice(0, PREVIEW_COLUMNS),
    rows: rows.map((row) =>
      (Array.isArray(row) ? row : [])
        .slice(0, PREVIEW_COLUMNS)
        .map((cell) => (cell === null || cell === undefined ? "" : String(cell)))),
    totalCols: result?.columnCount || headers.length,
  };
}
