import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

/**
 * The landing page. Every figure on it has to be the sample file's or the
 * product's own, in all three languages, nothing a visitor presses may call the
 * server, and it talks to customers, not to engineers.
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
import {
  BLANKS, CLOSING, FAQ, FOOTER, FOUNDER, LINKEDIN, MESSY_COLUMNS, MESSY_ROWS, PROOF, REPORT_LANGUAGES, SHARE, TRUST, money, percent,
} from "@/app/home/homeCopy";
import { DISCOUNT_ITEMS, HERO, HERO_SAVED_QUESTIONS, RATING, STORE_RATIO, WEEKEND_LIFT } from "@/app/home/heroCopy";
import { TITLE_IN, VERSUS } from "@/app/home/versusCopy";
import { CHECK } from "@/app/demo/demoFacts";

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

describe("the messy rows, and the cleaning", () => {
  const lines = readFileSync(path.join(PUBLIC, "demo/coffee_sales.csv"), "utf-8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const cleaned = readFileSync(path.join(PUBLIC, "demo/cleaned_coffee_sales.csv"), "utf-8").trim().split(/\r?\n/).map(l => l.split(","));

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

  it("shows each fixed cell as the cleaned file has it, and the repeat once", () => {
    for (const r of MESSY_ROWS.filter(x => x.fixed)) {
      const [date, store, product] = r.cells;
      const match = cleaned.filter(c => c[0] === date && c[1] === store && c[2] === product);
      expect(match).toHaveLength(1);
      const col = r.flag === "blank" ? "satisfaction" : "units_sold";
      expect(Number(match[0][head.indexOf(col)]).toFixed(1)).toBe(r.fixed);
    }
    const dup = MESSY_ROWS.find(r => r.flag === "dup")!;
    expect(cleaned.filter(c => c[0] === dup.cells[0] && c[1] === dup.cells[1] && c[2] === dup.cells[2])).toHaveLength(1);
  });

  it("lights up the rows of the problem pressed", () => {
    page();
    const proof = within(section("proof"));
    fireEvent.click(proof.getByRole("button", { name: new RegExp(PROOF.en.problems[0]) }));
    const rows = [...section("proof").querySelectorAll("tbody tr")];
    expect(rows.filter(r => r.classList.contains("hp-lit"))).toHaveLength(2);
    expect(rows.filter(r => r.classList.contains("hp-dim"))).toHaveLength(3);
    expect(proof.getByRole("button", { name: new RegExp(PROOF.en.problems[0]) })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks before it cleans, then shows what it changed", () => {
    page();
    const proof = within(section("proof"));
    expect(proof.getByText(PROOF.en.askFirst)).toBeInTheDocument();
    expect(section("proof").querySelector(".hp-good")).toBeNull();

    fireEvent.click(proof.getByRole("button", { name: PROOF.en.clean }));
    const fixed = [...section("proof").querySelectorAll(".hp-good")].map(m => m.textContent);
    expect(fixed).toEqual(MESSY_ROWS.filter(r => r.fixed).map(r => r.fixed));
    expect(section("proof").querySelectorAll("tr.hp-gone")).toHaveLength(1);
    for (const n of [CHECK.repeatedRows, BLANKS, CHECK.belowZero]) expect(section("proof").querySelector(".hp-done")).toHaveTextContent(String(n));
    expect(proof.getByRole("link", { name: PROOF.en.csv })).toHaveAttribute("href", FILES.find(f => f.href.includes("cleaned"))!.href);

    fireEvent.click(proof.getByRole("button", { name: PROOF.en.again }));
    expect(proof.getByRole("button", { name: PROOF.en.clean })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── Press one ─────────────────────────────────────────────────────────────────

describe("the three things to press", () => {
  it("quotes the sample's saved refusal word for word", () => {
    const refused = PROOF.en.answers[2];
    const declined = sample.answers.find(a => a.q === refused.q)!;
    expect(refused.a).toBe(declined.a);
    expect(declined.source).toBe("refused");
  });

  it.each(LANGS)("gives the same figures in %s", lang => {
    const [share, weekend] = PROOF[lang].answers;
    expect(digits(share.q)).toContain(String(SHARE));
    expect(digits(share.a)).toContain(cents(REVENUE.byProduct[0].total));
    expect(digits(share.a)).toContain(cents(REVENUE.total));
    expect(digits(weekend.a)).toContain(cents(REVENUE.perDay.weekend));
    expect(digits(weekend.a)).toContain(cents(REVENUE.perDay.weekday));
    expect(numbers(weekend.a)).toContain(WEEKEND_LIFT);
    expect(PROOF[lang].answers.map(a => a.kind)).toEqual(["worked", "worked", "refused"]);
  });

  it("asks nothing the window under the title already asks", () => {
    for (const lang of LANGS) {
      const above = HERO[lang].answers.map(a => a.q);
      for (const a of PROOF[lang].answers) expect(above).not.toContain(a.q);
    }
  });

  it("answers what is pressed, without calling anything", () => {
    page();
    const proof = within(section("proof"));
    const [share, weekend, refused] = PROOF.en.answers;
    expect(proof.getByText(share.a)).toBeInTheDocument();
    expect(proof.getByText("$122,040.59 ÷ $381,667.10 = 32%")).toBeInTheDocument();

    fireEvent.click(proof.getByRole("button", { name: weekend.q }));
    expect(proof.getByText(weekend.a)).toBeInTheDocument();
    expect(proof.queryByText(share.a)).toBeNull();

    fireEvent.click(proof.getByRole("button", { name: refused.q }));
    expect(proof.getByRole("button", { name: refused.q })).toHaveAttribute("aria-pressed", "true");
    expect(proof.getByText(refused.badge)).toBeInTheDocument();
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
    expect(hrefs).toEqual(["#features", "#security", "#pricing", "#faq", "#contact"]);
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

// ── The product under the title ───────────────────────────────────────────────

describe("the product under the title", () => {
  const win = (lang: (typeof LANGS)[number] = "en") => screen.getByRole("group", { name: HERO[lang].label });
  // French money and percentages use no-break spaces; compare like with like.
  const flat = (s: string) => s.replace(/\s+/g, " ");

  it.each(LANGS)("opens on the sample's first finding, figure and answer in %s", lang => {
    page(lang);
    const text = flat(win(lang).textContent ?? "");
    expect(text).toContain(flat(HERO[lang].findings[0].title));
    expect(text).toContain(flat(percent(lang, SHARE)));
    expect(text).toContain(flat(HERO[lang].answers[0].a));
    const chart = win(lang).querySelector("img")!;
    expect(chart.getAttribute("src")).toBe(sample.report.insights[0].chart.src);
  });

  it("steps through the report's five findings, each with its own chart", () => {
    page();
    const w = within(win());
    for (let i = 1; i <= 5; i++) {
      const at = i % 5;
      fireEvent.click(w.getByRole("button", { name: HERO.en.next }));
      expect(win()).toHaveTextContent(HERO.en.findings[at].title);
      expect(win().querySelector(".hp-win-swap img")!.getAttribute("src")).toBe(sample.report.insights[at].chart.src);
    }
    for (const src of sample.report.insights.map(x => x.chart.src)) expect(existsSync(path.join(PUBLIC, src))).toBe(true);
  });

  it("takes each finding's title and figures from the sample report", () => {
    sample.report.insights.forEach((x, i) => expect(HERO.en.findings[i].title).toBe(x.title));
    expect(sample.report.summary).toContain(`${STORE_RATIO.toFixed(2)} times Midtown`);
    expect(sample.report.insights[2].title).toContain(percent("en", WEEKEND_LIFT));
    expect(sample.report.insights[3].body).toContain(`about ${DISCOUNT_ITEMS.with} items sold instead of ${DISCOUNT_ITEMS.without}`);
    expect(sample.report.summary).toContain(money("en", REVENUE.bestMonth.total));
    const discounts = sample.answers.find(a => a.q === HERO_SAVED_QUESTIONS[1])!;
    expect(discounts.a).toContain(RATING.with.toFixed(2));
    expect(discounts.a).toContain(RATING.without.toFixed(2));
  });

  it.each(LANGS)("answers with the sample's own figures in %s", lang => {
    const [store, discounts, total] = HERO[lang].answers;
    expect(digits(store.a)).toContain(cents(REVENUE.byStore[0].total));
    expect(numbers(discounts.a)).toEqual(expect.arrayContaining([417, 430]));
    expect(digits(total.a)).toContain(cents(REVENUE.total));
  });

  it("quotes the saved answers word for word in English", () => {
    HERO.en.answers.forEach((a, i) => {
      const saved = sample.answers.find(x => x.q === HERO_SAVED_QUESTIONS[i])!;
      expect(a.q).toBe(saved.q);
      expect(a.a).toBe(saved.a);
    });
  });

  it("switches tabs, and a chart opens its finding", () => {
    page();
    const w = within(win());
    fireEvent.click(w.getByRole("tab", { name: HERO.en.tabs[1] }));
    const thumbs = win().querySelectorAll(".hp-win-charts button");
    expect(thumbs).toHaveLength(5);
    fireEvent.click(thumbs[2]);
    expect(w.getByRole("tab", { name: HERO.en.tabs[0] })).toHaveAttribute("aria-selected", "true");
    expect(win()).toHaveTextContent(HERO.en.findings[2].title);

    fireEvent.click(w.getByRole("tab", { name: HERO.en.tabs[2] }));
    for (const h of sample.file.headers) expect(w.getByRole("columnheader", { name: h })).toBeInTheDocument();
  });

  it("answers the question pressed, and says where to ask anything else", async () => {
    page();
    const w = within(win());
    fireEvent.click(w.getByRole("button", { name: HERO.en.answers[1].q }));
    expect(await w.findByText(HERO.en.answers[1].a, {}, { timeout: 2000 })).toBeInTheDocument();

    fireEvent.change(w.getByRole("textbox", { name: HERO.en.placeholder }), { target: { value: "What sold best in March?" } });
    fireEvent.click(w.getByRole("button", { name: HERO.en.send }));
    expect(await w.findByText(HERO.en.offline, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(w.getByText("What sold best in March?")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does what its three dots say", () => {
    page();
    const w = within(win());
    fireEvent.click(w.getByRole("button", { name: HERO.en.dots.chatOff }));
    expect(w.queryByText(HERO.en.ask)).toBeNull();
    fireEvent.click(w.getByRole("button", { name: HERO.en.dots.chatOn }));
    expect(w.getByText(HERO.en.ask)).toBeInTheDocument();

    fireEvent.click(w.getByRole("button", { name: HERO.en.dots.big }));
    expect(win()).toHaveClass("hp-win-big");

    fireEvent.click(w.getByRole("button", { name: HERO.en.dots.min }));
    expect(w.queryByRole("tablist")).toBeNull();
    fireEvent.click(w.getByRole("button", { name: new RegExp(HERO.en.reopen) }));
    expect(w.getByRole("tablist")).toBeInTheDocument();
  });

  it("hands over the sample's real files from Report ready", () => {
    page();
    const w = within(win());
    fireEvent.click(w.getByRole("button", { name: new RegExp(HERO.en.ready) }));
    const links = w.getAllByRole("menuitem");
    expect(links).toHaveLength(4);
    for (const a of links) expect(existsSync(path.join(PUBLIC, a.getAttribute("href")!))).toBe(true);
    expect(links.filter(a => a.textContent?.includes("Pro"))).toHaveLength(2);
  });
});

// ── Security, in a customer's words ───────────────────────────────────────────

describe("security", () => {
  // How the site is built is not a promise to a customer. These were on the
  // page, and the owner asked for them to go.
  const BUILD_WORDS = /HTTPS|JWT|Supabase|API|token|hash|end to end|de bout en bout|ابتدا تا انتها|Stripe/i;

  it.each(LANGS)("makes three plain promises in %s, and names no technology", lang => {
    page(lang);
    const block = section("security");
    expect(block.querySelectorAll(".hp-promises li")).toHaveLength(3);
    expect(block.textContent).not.toMatch(BUILD_WORDS);
    expect(within(block).getByRole("link", { name: TRUST[lang].policy })).toHaveAttribute("href", "/privacy");
  });

  it("promises no more than the Privacy Policy says", () => {
    const policy = readFileSync(path.join(ROOT, "app/privacy/page.tsx"), "utf-8");
    // A summary and a few example values go to the AI; the policy says so.
    expect(policy).toContain("up to five example values taken from each column");
    expect(TRUST.en.items[0].body).toContain("a few example values, never the whole file");
    // Deleting an analysis and an account both exist.
    const api = readFileSync(path.join(ROOT, "lib/BackendAPI.js"), "utf-8");
    expect(api).toMatch(/static async deleteAnalysis\(/);
    expect(api).toMatch(/static async deleteAccount\(/);
    // Not claimed: the free AI services may keep logs under their own terms.
    for (const lang of LANGS) expect(JSON.stringify(TRUST[lang])).not.toMatch(/train/i);
  });

  it.each(LANGS)("says nothing about the payment company under the prices in %s", lang => {
    page(lang);
    expect(section("pricing").textContent).not.toMatch(/Stripe|card details|données de votre carte|processed securely/i);
  });
});

// ── Questions ─────────────────────────────────────────────────────────────────

describe("questions", () => {
  it.each(LANGS)("answers the same questions with the product's own figures in %s", lang => {
    page(lang);
    const items = section("faq").querySelectorAll("details");
    expect(items).toHaveLength(FAQ.en.items.length);
    const free = numbers(FAQ[lang].items[2].a);
    expect(free).toEqual(expect.arrayContaining([PLANS.free.window.count, PLANS.free.window.hours, PLANS.free.questions]));
    expect(numbers(FAQ[lang].items[5].a)).toContain(REPORT_LANGUAGES[lang].length);
    expect(numbers(FAQ[lang].items[0].a)).toContain(50);
  });

  it("opens an answer without a script", () => {
    page();
    const first = section("faq").querySelector("details")!;
    expect(first.querySelector("summary")).toHaveTextContent(FAQ.en.items[0].q);
    expect(first).toHaveTextContent(FAQ.en.items[0].a);
  });
});

// ── The last word, the footer, and no Developer section ──────────────────────

describe("the end of the page", () => {
  it("ends on the demo, sign-up and a way to ask", () => {
    page();
    const close = within(section("contact"));
    expect(close.getByRole("link", { name: CLOSING.en.demo })).toHaveAttribute("href", "/demo");
    expect(close.getByRole("link", { name: CLOSING.en.register })).toHaveAttribute("href", "/register");
    expect(close.getByRole("link", { name: CLOSING.en.write }).getAttribute("href")).toMatch(/^mailto:/);
    // The buttons never fade: a reader who scrolls down fast sees them at once.
    expect(section("contact").querySelector(".hp-close-btns")).toHaveAttribute("data-rv", "solid");
  });

  it.each(LANGS)("links DIG's LinkedIn and its founder's in the footer in %s", lang => {
    page(lang);
    const foot = document.querySelector("footer")!;
    const hrefs = [...foot.querySelectorAll("a")].map(a => a.getAttribute("href"));
    expect(hrefs).toContain(LINKEDIN.dig);
    expect(hrefs).toContain(LINKEDIN.founder);
    for (const a of foot.querySelectorAll<HTMLAnchorElement>('a[href*="linkedin.com"]')) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
    expect(foot).toHaveTextContent(FOOTER[lang].founder);
    expect(hrefs).toEqual(expect.arrayContaining(["/privacy", "/terms", "/demo"]));
  });

  it.each(LANGS)("introduces the developer by name, role and school, and nothing more personal, in %s", lang => {
    page(lang);
    const block = section("founder");
    const t = FOUNDER[lang];
    for (const line of [t.name, t.role, t.school, t.quote]) expect(block).toHaveTextContent(line);
    const linkedin = within(block).getByRole("link", { name: new RegExp(t.linkedin) });
    expect(linkedin).toHaveAttribute("href", LINKEDIN.founder);
    expect(linkedin).toHaveAttribute("target", "_blank");
    // Where the founder lives stays off the page, and so does the old origin line.
    expect(JSON.stringify(FOUNDER)).not.toMatch(/Toronto|Ontario|Alberta|تورنتو|انتاریو/);
    expect(block.textContent).not.toMatch(/group project|projet de groupe|پروژهٔ گروهی/);
    // The quote is never faded: it is what the section is for.
    expect(block.querySelector(".hp-quote")).toHaveAttribute("data-rv", "solid");
  });

  it.each(LANGS)("says DIG is an AI analyst, in the heading and the quote, in %s", lang => {
    const ai = /\bAI\b|\bIA\b|هوش مصنوعی/;
    expect(FOUNDER[lang].heading).toMatch(ai);
    expect(FOUNDER[lang].quote).toMatch(ai);
  });

  it.each(LANGS)("opens each of the five differences when it is pressed, in %s", lang => {
    page(lang);
    const block = within(section("why"));
    expect(section("why").querySelector("h2")).toHaveTextContent(VERSUS[lang].heading.split(". ")[0]);
    const tabs = block.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    VERSUS[lang].powers.forEach((power, i) => {
      fireEvent.click(tabs[i]);
      expect(tabs[i]).toHaveAttribute("aria-selected", "true");
      const stage = block.getByRole("tabpanel");
      expect(stage.querySelector("h3")).toHaveTextContent(power.title);
      expect(stage).toHaveTextContent(power.body);
    });
    // A comparison names no other product.
    expect(JSON.stringify(VERSUS)).not.toMatch(/ChatGPT|OpenAI|Gemini|Claude|Copilot|Perplexity|Grok/i);
    // The team cap and the languages are the plans' own.
    expect(VERSUS[lang].powers[2].pro).toMatch(/five|cinq|پنج/);
    expect(numbers(VERSUS[lang].powers[4].pro!)).toContain(REPORT_LANGUAGES[lang].length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("plays each scene: readers, the chat, the team, the proof and the languages", () => {
    page();
    const block = within(section("why"));
    const tabs = block.getAllByRole("tab");
    const t = VERSUS.en;

    fireEvent.click(block.getByRole("button", { name: t.readers[2].who }));
    expect(block.getByText(t.readers[2].text)).toBeInTheDocument();

    fireEvent.click(tabs[1]);
    expect(block.getByText(t.chat.version(1))).toBeInTheDocument();
    fireEvent.click(block.getByRole("button", { name: new RegExp(t.chat.add) }));
    expect(block.getByText(t.chat.version(2))).toBeInTheDocument();
    expect(block.getByText(t.chat.added)).toBeInTheDocument();
    fireEvent.click(block.getByRole("button", { name: new RegExp(t.chat.undo) }));
    expect(block.getByText(t.chat.version(1))).toBeInTheDocument();

    fireEvent.click(tabs[2]);
    fireEvent.click(block.getByRole("button", { name: `Leo, ${t.team.people[3].role}` }));
    expect(block.getByText(t.team.people[3].can)).toBeInTheDocument();

    fireEvent.click(tabs[3]);
    fireEvent.click(block.getByRole("button", { name: t.proof.n2 }));
    expect(block.getByText(t.proof.check2)).toBeInTheDocument();
    expect(t.proof.check2).toContain(STORE_RATIO.toFixed(2));

    fireEvent.click(tabs[4]);
    expect(block.getAllByRole("button").filter(b => REPORT_LANGUAGES.en.includes(b.textContent ?? ""))).toHaveLength(8);
    fireEvent.click(block.getByRole("button", { name: "Arabic" }));
    const out = block.getByText(TITLE_IN[5].text);
    expect(out).toHaveAttribute("dir", "rtl");
    expect(TITLE_IN[0].text).toBe(sample.report.insights[0].title);
  });

  it("keeps the features and the difference apart", () => {
    page();
    const features = section("features").textContent ?? "";
    expect(features).not.toMatch(/team|chat|reader|version/i);
    for (const power of VERSUS.en.powers) expect(features).not.toContain(power.title);
  });

  it("keeps the founder's name in the footer as well", () => {
    page();
    expect(document.querySelector("footer")).toHaveTextContent(FOOTER.en.founder);
  });

  it("points at real companies' pages, and DIG's is the one in the notes", () => {
    expect(LINKEDIN.dig).toMatch(/^https:\/\/www\.linkedin\.com\/company\/\d+\/$/);
    expect(LINKEDIN.founder).toMatch(/^https:\/\/www\.linkedin\.com\/in\/[a-z-]+\/$/);
  });
});

// ── The bar at the top, on a phone ────────────────────────────────────────────

describe("the bar on a phone", () => {
  const source = readFileSync(path.join(ROOT, "app/page.tsx"), "utf-8");

  it("shows the theme as an icon, with its name for screen readers", () => {
    page();
    const theme = document.querySelector<HTMLButtonElement>(".atlas-theme")!;
    expect(theme.textContent).toBe("");
    expect(theme).toHaveAttribute("aria-label", "Theme: Dark");
  });

  it("moves the language buttons into the menu on the narrowest phones", () => {
    page();
    fireEvent.click(document.querySelector(".atlas-burger")!);
    const row = document.querySelector("#atlas-menu .atlas-menu-lang")!;
    expect([...row.querySelectorAll("button")].map(b => b.textContent)).toEqual(["EN", "FR", "FA"]);
    expect(source).toContain("'@media (max-width: 359px) {',");
    expect(source).toContain("'  .atlas-header .atlas-lang { display: none; }',");
    // An inline display would outrank that rule and the bar would wrap again.
    expect(document.querySelector<HTMLElement>(".atlas-header .atlas-lang")!.style.display).toBe("");
  });

  it("keeps the short bar until the wordmark fits beside everything else", () => {
    expect(source).toContain("'@media (max-width: 519px) {',\r\n    '  .atlas-wordmark { display: none; }',".replace(/\r\n/g, source.includes("\r\n") ? "\r\n" : "\n"));
  });
});
