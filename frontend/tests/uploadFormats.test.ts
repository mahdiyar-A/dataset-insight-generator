import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  UPLOAD_ACCEPT, UPLOAD_EXTENSIONS, canPreviewInBrowser, cleanedFileName, extensionOf,
  isAcceptedFile, previewFromUpload,
} from "@/lib/uploadFormats";

/**
 * The list exists three times: here, in the backend and in the AI service's
 * reader. If they drift, the form offers a file the server refuses, and the
 * user only finds out after choosing it.
 */

describe("the format list", () => {
  it("matches the backend's", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../backend/Application/Services/FileFormats.cs"), "utf8");
    const block = source.match(/Extensions[^{]*\{([\s\S]*?)\}/)?.[1] ?? "";
    const backend = [...block.matchAll(/"(\.[a-z0-9]+)"/g)].map((m) => m[1]);

    expect(backend.length).toBeGreaterThan(0);
    expect([...UPLOAD_EXTENSIONS].sort()).toEqual([...backend].sort());
  });

  it("feeds the file picker", () => {
    expect(UPLOAD_ACCEPT.split(",")).toEqual(UPLOAD_EXTENSIONS);
  });
});

describe("isAcceptedFile", () => {
  it.each(["sales.csv", "SALES.XLSX", "archive.csv.gz", "survey.sav", "  padded.parquet  "])(
    "accepts %s", (name) => {
      expect(isAcceptedFile(name)).toBe(true);
    });

  it.each(["report.pdf", "setup.exe", "no-extension", "", ".csv"])("refuses %j", (name) => {
    expect(isAcceptedFile(name)).toBe(false);
  });

  it("refuses a missing name", () => {
    expect(isAcceptedFile(null)).toBe(false);
    expect(extensionOf(undefined)).toBe("");
  });
});

describe("canPreviewInBrowser", () => {
  it("is only true for plain CSV", () => {
    // Risk: reading a Parquet file as text fills the preview with binary noise.
    expect(canPreviewInBrowser("a.csv")).toBe(true);
    expect(canPreviewInBrowser("a.parquet")).toBe(false);
    expect(canPreviewInBrowser("a.csv.gz")).toBe(false);
  });
});

describe("cleanedFileName", () => {
  // The same cases as FileFormatsTests.CleanedFileName_IsAlwaysCsv.
  it.each([
    ["sales.csv", "cleaned_sales.csv"],
    ["sales.xlsx", "cleaned_sales.csv"],
    ["orders.csv.gz", "cleaned_orders.csv"],
    ["q1.results.parquet", "cleaned_q1.results.csv"],
    ["", "cleaned_data.csv"],
  ])("%s gives %s", (name, expected) => {
    expect(cleanedFileName(name)).toBe(expected);
  });

  it("copes with no name at all", () => {
    expect(cleanedFileName(undefined)).toBe("cleaned_data.csv");
  });
});

describe("previewFromUpload", () => {
  it("is null when the server did not read the file", () => {
    expect(previewFromUpload({ headers: [] })).toBeNull();
    expect(previewFromUpload({})).toBeNull();
    expect(previewFromUpload(null)).toBeNull();
  });

  it("keeps every cell a string, because the table calls string methods on them", () => {
    const view = previewFromUpload({ headers: ["a", "b"], preview: [[null, 3]], columnCount: 2 });
    expect(view?.rows).toEqual([["", "3"]]);
  });

  it("shows at most 10 columns but reports the true total", () => {
    const headers = Array.from({ length: 14 }, (_, i) => `c${i}`);
    const view = previewFromUpload({ headers, preview: [headers], columnCount: 14 });

    expect(view?.headers).toHaveLength(10);
    expect(view?.rows[0]).toHaveLength(10);
    expect(view?.totalCols).toBe(14);
  });
});
