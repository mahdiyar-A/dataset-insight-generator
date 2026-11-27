import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Persian letters come from the site's own copy of Vazirmatn, so a phone with
 * no Persian font of its own still shows words, not empty boxes. These checks
 * keep the font in the project, limited to Arabic-script letters, and first in
 * every font list the site uses.
 */

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("the Persian font", () => {
  it("is in the project, with its licence", () => {
    const font = path.join(root, "app/fonts/Vazirmatn-NL.woff2");
    expect(existsSync(font)).toBe(true);
    expect(readFileSync(font).subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(statSync(font).size).toBeLessThan(100_000);
    expect(read("app/fonts/OFL-Vazirmatn.txt")).toContain("SIL Open Font License");
  });

  it("is loaded only for Arabic-script letters, with no fallback face", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('src: "./fonts/Vazirmatn-NL.woff2"');
    expect(layout).toContain('variable: "--font-fa"');
    expect(layout).toMatch(/prop: "unicode-range", value: "U\+0600-06FF/);
    expect(layout).toContain("adjustFontFallback: false");
    expect(layout).toContain("preload: false");
    expect(layout).toContain("${persian.variable}");
  });

  it("comes first in every font list that names the site's faces", () => {
    const files = ["app/globals.css", "app/home/atlas.ts", "app/demo/demoStyles.ts"];
    for (const file of files) {
      const lists = read(file).match(/var\(--font-(?:sans|display)\)/g) ?? [];
      const first = read(file).match(/var\(--font-fa\), var\(--font-(?:sans|display)\)/g) ?? [];
      expect(lists.length, file).toBeGreaterThan(0);
      expect(first.length, file).toBe(lists.length);
    }
  });
});
