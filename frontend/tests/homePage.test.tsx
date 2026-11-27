import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

/**
 * The landing page's proof, files and pricing sections. Every figure on them
 * has to be the sample file's or the product's own, in all three languages,
 * and nothing a visitor presses may call the server.
 */

const settings = vi.hoisted(() => ({ lang: "en" as "en" | "fr" | "fa" }));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({ lang: settings.lang, setLang: () => {}, brightness: 10, setBrightness: () => {} }),
}));

// jsdom works out every element's style from a page's stylesheets on each
// query, and nothing checked here depends on these.
vi.mock("@/app/home/homeStyles", () => ({ HOME_CSS: "" }));
vi.mock("@/components/DigMascot", () => ({ default: () => null }));

vi.mock("next/image", () => ({
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import HomePage from "@/app/page";
import { FILES, PLANS, REVENUE } from "@/app/demo/demoFacts";
import sample from "@/app/demo/sample.json";
import { MESSY_COLUMNS, MESSY_ROWS, PROOF, REPORT_LANGUAGES, SHARE, percent } from "@/app/home/homeCopy";

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const LANGS = ["en", "fr", "fa"] as const;

const fetchSpy = vi.fn();

beforeEach(() => {
  settings.lang = "en";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

function page(lang: (typeof LANGS)[number] = "en") {
  settings.lang = lang;
  return render(<HomePage />);
}

const section = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id} on the page`);
  return el;
};

/** Text with Persian digits as plain ones. */
const latin = (s: string) => s.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
/** Every number in a text as its digits alone, whatever separators it uses. */
const digits = (s: string) => latin(s).replace(/(\d)[\s  ,.٬٫](?=\d)/g, "$1");
const numbers = (s: string) => (digits(s).match(/\d+/g) ?? []).map(Number);
const cents = (n: number) => n.toFixed(2).replace(".", "");

// ── Before and after ──────────────────────────────────────────────────────────

describe("the messy rows and the finding", () => {
  const lines = readFileSync(path.join(PUBLIC, "demo/coffee_sales.csv"), "utf-8").trim().split(/\r?\n/);
  const head = lines[0].split(",");

  it("shows rows that are in the sample file, at those row numbers", () => {
    for (const r of MESSY_ROWS) {
      const cells = lines[r.row].split(",");
      expect(MESSY_COLUMNS.map(c => cells[head.indexOf(c)])).toEqual(r.cells);
    }
  });

  it("marks only problems those rows really have", () => {
    const [dupA, dupB] = MESSY_ROWS.filter(r => r.flag === "dup");
    expect(lines[dupA.row]).toBe(lines[dupB.row]);
    const blank = MESSY_ROWS.find(r => r.flag === "blank")!;
    expect(blank.cells).toContain("");
    const negative = MESSY_ROWS.find(r => r.flag === "neg")!;
    expect(Number(negative.cells[MESSY_COLUMNS.indexOf("units_sold")])).toBeLessThan(0);
    const fine = MESSY_ROWS.find(r => !r.flag)!;
    expect(fine.cells).not.toContain("");
  });

  it("states the report's own finding and share", () => {
    expect(PROOF.en.finding).toBe(sample.report.insights[0].title);
    expect(SHARE).toBe(Math.round((100 * REVENUE.byProduct[0].total) / REVENUE.total));
    expect(sample.report.summary).toContain(percent("en", SHARE));
  });

  it("draws one bar per product, longest first", () => {
    page();
    const bars = [...section("proof").querySelectorAll<HTMLElement>(".hp-bars li")];
    expect(bars.map(b => b.querySelector(".hp-bar-name")!.textContent)).toEqual(REVENUE.byProduct.map(p => p.name));
    const widths = bars.map(b => parseFloat(b.querySelector<HTMLElement>(".hp-fill")!.style.width));
    expect(widths[0]).toBe(100);
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
  });
});

// ── Press one ─────────────────────────────────────────────────────────────────

describe("the three things to press", () => {
  it("quotes the sample's saved answers word for word", () => {
    const [, looked, refused] = PROOF.en.answers;
    const saved = sample.answers.find(a => a.q === looked.q)!;
    expect(looked.a).toBe(saved.a);
    expect(saved.source).toBe("data");
    const declined = sample.answers.find(a => a.q === refused.q)!;
    expect(refused.a).toBe(declined.a);
    expect(declined.source).toBe("refused");
  });

  it.each(LANGS)("gives the same figures in %s", lang => {
    const [worked, looked] = PROOF[lang].answers;
    expect(digits(worked.q)).toContain(String(SHARE));
    expect(digits(worked.a)).toContain(cents(REVENUE.byProduct[0].total));
    expect(digits(worked.a)).toContain(cents(REVENUE.total));
    expect(digits(looked.a)).toContain(cents(REVENUE.byStore[0].total));
    expect(PROOF[lang].answers.map(a => a.kind)).toEqual(["worked", "looked", "refused"]);
  });

  it("answers what is pressed, without calling anything", () => {
    page();
    const proof = within(section("proof"));
    const [worked, looked, refused] = PROOF.en.answers;
    expect(proof.getByText(worked.a)).toBeInTheDocument();
    expect(proof.getByText("$122,040.59 ÷ $381,667.10 = 32%")).toBeInTheDocument();

    fireEvent.click(proof.getByRole("button", { name: looked.q }));
    expect(proof.getByText(looked.a)).toBeInTheDocument();
    expect(proof.queryByText(worked.a)).toBeNull();

    fireEvent.click(proof.getByRole("button", { name: refused.q }));
    expect(proof.getByRole("button", { name: refused.q })).toHaveAttribute("aria-pressed", "true");
    expect(proof.getByText(refused.badge)).toBeInTheDocument();

    // The big number explains itself.
    fireEvent.click(proof.getByRole("button", { name: /32% of the year/ }));
    expect(proof.getByText(worked.a)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leads on to the demo", () => {
    page();
    expect(within(section("proof")).getByRole("link", { name: PROOF.en.cta })).toHaveAttribute("href", "/demo");
  });
});

// ── The files ─────────────────────────────────────────────────────────────────

describe("the files", () => {
  it("shows a page of each kind, linked to the sample file it is a picture of", () => {
    page();
    const cards = [...section("files").querySelectorAll<HTMLAnchorElement>("a.hp-file")];
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const file = FILES.find(f => f.href === card.getAttribute("href"))!;
      expect(existsSync(path.join(PUBLIC, file.href))).toBe(true);
      expect(card).toHaveTextContent(file.pro ? "Pro" : "Every plan");
      expect(card).toHaveTextContent(file.size);
      // The PDF opens to be read; Word and PowerPoint can only be downloaded.
      if (file.ext === "pdf") expect(card).toHaveAttribute("target", "_blank");
      else expect(card).toHaveAttribute("download");

      const img = card.querySelector("img")!;
      const png = readFileSync(path.join(PUBLIC, img.getAttribute("src")!));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([Number(img.getAttribute("width")), Number(img.getAttribute("height"))]);
    }
  });

  it("offers the cleaned data too", () => {
    page();
    expect(within(section("files")).getByRole("link", { name: "Download the sample CSV" }))
      .toHaveAttribute("href", FILES.find(f => f.href.includes("cleaned"))!.href);
  });
});

// ── The plans ─────────────────────────────────────────────────────────────────

describe("pricing", () => {
  it.each(LANGS)("states the product's limits and price in %s", lang => {
    page(lang);
    const card = (id: string) => section("pricing").querySelector<HTMLElement>(`.hp-plan-${id}`)!;
    const lines = (id: string) => [...card(id).querySelectorAll("li")].map(li => numbers(li.textContent ?? ""));

    expect(digits(card("free").querySelector(".hp-price")!.textContent ?? "")).toMatch(/(^|\D)0(\D|$)/);
    expect(digits(card("pro").querySelector(".hp-price")!.textContent ?? "")).toContain(PLANS.pro.price.replace(/\D/g, ""));
    expect(lines("free").slice(0, 3)).toEqual([[PLANS.free.window.count, PLANS.free.window.hours], [PLANS.free.kept], [PLANS.free.questions]]);
    expect(lines("pro").slice(0, 3)).toEqual([[PLANS.pro.window.count], [PLANS.pro.kept], [PLANS.pro.questions]]);
    expect(lines("pro")).toContainEqual([REPORT_LANGUAGES[lang].length]);
    expect(card("pro").querySelector(".hp-price")).toHaveTextContent(lang === "fa" ? "کانادا" : "CAD");
  });

  it("sends both plans to the sign-up page, and makes no claim about which is popular", () => {
    page();
    const links = within(section("pricing")).getAllByRole("link");
    expect(links.map(a => a.getAttribute("href"))).toEqual(["/register", "/register"]);
    expect(section("pricing").textContent).not.toMatch(/popular/i);
  });

  it("counts the languages a report can really be written in", () => {
    const harness = readFileSync(path.resolve(ROOT, "../ai_service/ai_engine/llm/harness.py"), "utf-8");
    const names = harness.match(/LANGUAGE_NAMES = \{([\s\S]*?)\}/)![1].match(/: "([A-Za-z]+)"/g)!.map(m => m.slice(3, -1));
    expect([...REPORT_LANGUAGES.en].sort()).toEqual([...names].sort());
    for (const lang of LANGS) expect(REPORT_LANGUAGES[lang]).toHaveLength(names.length);
  });

  it.each([
    ["en", "REPORTS IN 8 LANGUAGES ON PRO"],
    ["fr", "RAPPORTS EN 8 LANGUES AVEC PRO"],
    ["fa", "گزارش به ۸ زبان در Pro"],
  ] as const)("says in the %s ticker that the languages are the report's, on Pro", (lang, words) => {
    page(lang);
    const ticker = document.querySelector(".atlas-marquee")!;
    expect(ticker).toHaveTextContent(words);
    expect([...ticker.querySelectorAll("span")].map(s => s.textContent)).not.toContain("8 LANGUAGES");
  });
});

// ── The page around them ──────────────────────────────────────────────────────

describe("finding your way", () => {
  it.each(LANGS)("has a menu link to every section in %s", lang => {
    page(lang);
    const hrefs = [...document.querySelectorAll(".atlas-nav a")].map(a => a.getAttribute("href"));
    expect(hrefs).toEqual(["#features", "#security", "#pricing", "#developers", "#contact"]);
    for (const h of hrefs) expect(document.querySelector(h!)).not.toBeNull();
    for (const a of document.querySelectorAll(".atlas-nav a")) expect(a.textContent).toBeTruthy();
  });

  it("has the same links in the phone menu", () => {
    page();
    // By class: a wide window hides the button, and jsdom has a wide window.
    fireEvent.click(document.querySelector(".atlas-burger")!);
    const hrefs = [...document.querySelectorAll("#atlas-menu a")].map(a => a.getAttribute("href"));
    expect(hrefs).toContain("#pricing");
    expect(hrefs).toHaveLength(5);
  });

  it("hides and shows the menu at one width, in the stylesheet and the script alike", () => {
    const source = readFileSync(path.join(ROOT, "app/page.tsx"), "utf-8");
    const width = Number(source.match(/const MENU_BREAKPOINT = (\d+);/)![1]);
    expect(source).toContain(`'@media (max-width: ${width}px) {',`);
    expect(source).toContain(`'@media (min-width: ${width + 1}px) { .atlas-menu { display: none; } }',`);
  });

  it("never hides a heading or the buttons under the title while the page scrolls", () => {
    page();
    for (const h of document.querySelectorAll("h1, h2")) expect(h).toHaveAttribute("data-rv", "solid");
    const demo = screen.getByRole("link", { name: "Try the interactive demo" });
    expect(demo.closest("[data-rv]")).toHaveAttribute("data-rv", "solid");
    expect(document.querySelector("style")!.textContent).toContain('.rv-armed [data-rv="solid"] { opacity: 1;');
  });

  it("draws its symbols instead of typing them", () => {
    const { container } = page();
    expect(container.textContent).not.toMatch(/[▶✓✎↻↶⤢＋]/u);
  });
});
