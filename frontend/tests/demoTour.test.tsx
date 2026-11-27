import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import React from "react";

/**
 * The interactive demo at /demo: DIG walks a visitor through the basics on a
 * real sample file, then lets them explore. It is a sample, so it must never
 * call the server, and every figure it shows must come from the sample files.
 */

vi.mock("@/app/contexts/SettingsContext", () => ({
  DARK_BRIGHTNESS: 10,
  LIGHT_ABOVE: 65,
  LIGHT_BRIGHTNESS: 90,
  useSettings: () => ({ brightness: 10, setBrightness: () => {} }),
}));

// The demo's stylesheet is long, and jsdom works out every element's style
// from it each time a query asks whether something is visible: the file took
// two minutes and timed vitest's worker out. What these tests check does not
// depend on it; stops are hidden with the `hidden` attribute, which jsdom
// honours on its own.
vi.mock("@/app/demo/demoStyles", () => ({ DEMO_CSS: "" }));

vi.mock("next/image", () => ({
  // A stand-in for the optimised image: a plain <img> is the point here.
  default: ({ src, alt, loading }: { src: string; alt: string; loading?: "eager" | "lazy" }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import DemoTour from "@/app/demo/DemoTour";
import { CHECK, COLUMNS, DIG_QUIPS, EVIDENCE, FILE, FILES, PLAN_FEATURES, PLANS, REVENUE, ROLES, TEAM } from "@/app/demo/demoFacts";
import { COMMENT, PHRASE, REPLY, TYPED } from "@/app/demo/TeamStop";
import sample from "@/app/demo/sample.json";
import sitemap from "@/app/sitemap";

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

// ── The sample files, read the plain way ──────────────────────────────────────

function readCsv(name: string) {
  const lines = readFileSync(path.join(PUBLIC, "demo", name), "utf-8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const rows = lines.slice(1).map(l => l.split(","));
  const col = (row: string[], name: string) => row[head.indexOf(name)];
  return { head, rows, col };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The page's text with runs of whitespace as one plain space, as queries see it. */
const plain = (s: string) => s.replace(/\s+/g, " ").trim();

function groupRevenue(name: string, by: string) {
  const { rows, col } = readCsv(name);
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const key = col(r, by);
    groups.set(key, [...(groups.get(key) ?? []), Number(col(r, "revenue"))]);
  }
  return new Map(
    [...groups].map(([k, v]) => [k, { total: round2(v.reduce((a, b) => a + b, 0)), average: round2(v.reduce((a, b) => a + b, 0) / v.length) }]),
  );
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function wait(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

/** The stop on screen. Every stop stays mounted; the others are hidden. */
function stage() {
  const el = document.querySelector<HTMLElement>(".dg-stage:not([hidden])");
  if (!el) throw new Error("no stop is showing");
  return within(el);
}

function guide() {
  return document.querySelector(".dg-bubble")?.textContent ?? "";
}

function popIn() {
  return document.querySelector(".dg-pop")?.textContent ?? "";
}

function railStop(label: RegExp | string) {
  return within(document.querySelector<HTMLElement>(".dg-rail")!).getByRole("button", { name: label });
}

function start() {
  render(<DemoTour />);
  fireEvent.click(screen.getByRole("button", { name: /Let’s see a demo/ }));
}

/** Past the three basics, so every stop is open. */
function startExploring() {
  start();
  fireEvent.click(screen.getByRole("button", { name: /Skip the basics/ }));
}

function goTo(label: string) {
  fireEvent.click(railStop(label));
}

function headerPlan(name: "Free" | "Pro") {
  fireEvent.click(within(screen.getByRole("group", { name: "Show the demo as" })).getByRole("button", { name }));
}

// ── The figures ───────────────────────────────────────────────────────────────

describe("every figure the demo states comes from the sample files", () => {
  it("counts the rows, columns, dates, stores and products of the uploaded file", () => {
    const { head, rows, col } = readCsv("coffee_sales.csv");
    expect(rows.length).toBe(FILE.rows);
    expect(head.length).toBe(FILE.columns);
    expect(Object.keys(COLUMNS)).toEqual(head);
    const dates = rows.map(r => col(r, "date")).sort();
    expect([dates[0], dates[dates.length - 1]]).toEqual([FILE.firstDate, FILE.lastDate]);
    expect([...new Set(rows.map(r => col(r, "store")))].sort()).toEqual(FILE.stores);
    expect([...new Set(rows.map(r => col(r, "product")))].sort()).toEqual(FILE.products);
    expect(String(sample.file.rows)).toBe(FILE.rows.toLocaleString("en-US"));
    expect(String(sample.file.columns)).toBe(String(FILE.columns));
  });

  it("finds the repeated rows, blanks and negative units the check reports", () => {
    const { rows, col } = readCsv("coffee_sales.csv");
    const seen = new Set<string>();
    let repeated = 0;
    for (const r of rows) {
      const key = r.join(",");
      if (seen.has(key)) repeated += 1;
      seen.add(key);
    }
    expect(repeated).toBe(CHECK.repeatedRows);
    expect(rows.filter(r => col(r, "discount_pct") === "").length).toBe(CHECK.blanks.discount_pct);
    expect(rows.filter(r => col(r, "satisfaction") === "").length).toBe(CHECK.blanks.satisfaction);
    expect(rows.filter(r => Number(col(r, "units_sold")) < 0).length).toBe(CHECK.belowZero);
  });

  it("matches the cleaned file: fewer rows, no blanks, nothing below zero", () => {
    const { rows, col } = readCsv("cleaned_coffee_sales.csv");
    expect(rows.length).toBe(FILE.cleanRows);
    expect(rows.flat().filter(v => v === "").length).toBe(0);
    expect(rows.filter(r => Number(col(r, "units_sold")) < 0).length).toBe(0);
  });

  it("adds up revenue by product and by store from the cleaned file", () => {
    const { rows, col } = readCsv("cleaned_coffee_sales.csv");
    expect(round2(rows.reduce((a, r) => a + Number(col(r, "revenue")), 0))).toBe(REVENUE.total);
    const products = groupRevenue("cleaned_coffee_sales.csv", "product");
    for (const p of REVENUE.byProduct) expect(products.get(p.name)).toEqual({ total: p.total, average: p.average });
    const stores = groupRevenue("cleaned_coffee_sales.csv", "store");
    for (const s of REVENUE.byStore) expect(stores.get(s.name)).toEqual({ total: s.total, average: s.average });
    const noDiscount = rows.filter(r => Number(col(r, "discount_pct")) === 0).length;
    expect(Number(((100 * noDiscount) / rows.length).toFixed(1))).toBe(REVENUE.noDiscountShare);
  });

  it("explains the summary's numbers with sums that hold", () => {
    const { rows, col } = readCsv("cleaned_coffee_sales.csv");
    const sandwich = REVENUE.byProduct.find(p => p.name === "Sandwich")!;
    expect(Math.round((100 * sandwich.total) / REVENUE.total)).toBe(32);

    // One price for each product, the same in every shop; drip coffee is the cheapest.
    const prices = new Map<string, Set<number>>();
    for (const r of rows) prices.set(col(r, "product"), (prices.get(col(r, "product")) ?? new Set()).add(Number(col(r, "unit_price"))));
    for (const [name, price] of Object.entries(REVENUE.prices)) expect([...prices.get(name)!]).toEqual([price]);
    expect(Math.min(...[...prices.values()].flatMap(p => [...p]))).toBe(REVENUE.prices["Drip coffee"]);

    const [downtown, midtown] = [REVENUE.byStore[0], REVENUE.byStore[3]];
    expect((downtown.total / midtown.total).toFixed(2)).toBe("1.74");
    expect(`$${Math.round(downtown.total).toLocaleString("en-US")}`).toBe("$124,277");

    // A day's sales, the four shops together, at weekends and on weekdays.
    const days = new Map<string, number>();
    for (const r of rows) days.set(col(r, "date"), (days.get(col(r, "date")) ?? 0) + Number(col(r, "revenue")));
    const weekend = (d: string) => [0, 6].includes(new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay());
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(round2(mean([...days].filter(([d]) => weekend(d)).map(([, v]) => v)))).toBe(REVENUE.perDay.weekend);
    expect(round2(mean([...days].filter(([d]) => !weekend(d)).map(([, v]) => v)))).toBe(REVENUE.perDay.weekday);
    expect(Math.round(100 * (REVENUE.perDay.weekend / REVENUE.perDay.weekday - 1))).toBe(15);

    // The best and the quietest month.
    const months = new Map<number, number>();
    for (const r of rows) {
      const m = Number(col(r, "date").slice(5, 7));
      months.set(m, (months.get(m) ?? 0) + Number(col(r, "revenue")));
    }
    const ranked = [...months].sort((a, b) => b[1] - a[1]);
    expect([ranked[0][0], round2(ranked[0][1])]).toEqual([REVENUE.bestMonth.month, REVENUE.bestMonth.total]);
    const last = ranked[ranked.length - 1];
    expect([last[0], round2(last[1])]).toEqual([REVENUE.worstMonth.month, REVENUE.worstMonth.total]);
    expect(`$${Math.round(REVENUE.bestMonth.total).toLocaleString("en-US")}`).toBe("$37,007");
  });

  it("says in each evidence note the figures worked out from the file", () => {
    const notes = EVIDENCE.map(e => e.plain).join(" ");
    const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sandwich = REVENUE.byProduct.find(p => p.name === "Sandwich")!;
    for (const n of [sandwich.total, REVENUE.total, REVENUE.byStore[0].total, REVENUE.byStore[3].total,
      REVENUE.perDay.weekend, REVENUE.perDay.weekday, REVENUE.prices.Sandwich, REVENUE.prices["Drip coffee"]]) {
      expect(notes).toContain(money(n));
    }
    expect(notes).toContain(money(REVENUE.bestMonth.total));
    expect(notes).toContain(`$${Math.round(REVENUE.worstMonth.total).toLocaleString("en-US")}`);
  });

  it("is written for the shop's owner: no statistics on the page", () => {
    // Risk: the report a coffee shop owner reads first talked about p-values.
    const words = [sample.report.title, sample.report.summary, ...sample.report.insights.flatMap(i => [i.title, i.body]),
      sample.report.conclusion].join(" ");
    expect(words).not.toMatch(/p\s*[=<]|η|τ|ρ|\br\s*=|correlat|significan|variance|regression|eta-squared/i);
  });

  it("uses only numbers from the report's own summary as evidence", () => {
    for (const e of EVIDENCE) expect(sample.report.summary).toContain(e.text);
  });

  it("only says things in DIG's quips that the cleaned file shows", () => {
    const { rows, col } = readCsv("cleaned_coffee_sales.csv");
    const share = rows.filter(r => col(r, "product") === "Sandwich").length / rows.length;
    expect(share).toBeGreaterThan(0.18);
    expect(share).toBeLessThan(0.22); // "1 in 5 rows"
    const units = (store: string) => {
      const xs = rows.filter(r => col(r, "store") === store).map(r => Number(col(r, "units_sold")));
      return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    };
    expect(DIG_QUIPS.join(" ")).toContain(`Downtown sells about ${units("Downtown")} items a row. Midtown, about ${units("Midtown")}.`);
  });

  it("lists the real files, at their real sizes", () => {
    for (const f of FILES) {
      const file = path.join(PUBLIC, f.href);
      expect(existsSync(file)).toBe(true);
      expect(`${Math.round(statSync(file).size / 1024)} KB`).toBe(f.size);
    }
    for (const ins of sample.report.insights) expect(existsSync(path.join(PUBLIC, ins.chart.src))).toBe(true);
  });

  it("states the plans the way the Plans page does", () => {
    const plansPage = readFileSync(path.join(ROOT, "app/plans/page.tsx"), "utf-8");
    expect(plansPage).toContain(`"${PLANS.pro.price}"`);
    expect(plansPage).toContain(`"${PLANS.free.kept} history slots"`);
    expect(plansPage).toContain(`"${PLANS.pro.kept} history slots"`);
    expect(plansPage).toContain(`"${PLANS.free.questions} questions a day about your analyses"`);
    expect(plansPage).toContain(`"${PLANS.pro.questions} questions a day about your analyses"`);
    expect(plansPage).toContain('"2 analyses per 48 hours"');
    // The landing page builds its sentences from these.
    expect(PLANS.free.window).toEqual({ count: 2, hours: 48 });
    expect(PLANS.pro.window).toEqual({ count: 20, hours: 24 });
    expect(plansPage).toContain('"Up to 20 analyses a day"');
  });
});

// ── The tour ──────────────────────────────────────────────────────────────────

describe("the tour", () => {
  it("welcomes the visitor, then gets out of the way", () => {
    render(<DemoTour />);
    const welcome = screen.getByRole("dialog", { name: /Hi, I’m DIG/ });
    fireEvent.click(within(welcome).getByRole("button", { name: /I run a business/ }));
    expect(welcome).toHaveTextContent("what sells best");
    fireEvent.click(within(welcome).getByRole("button", { name: /Let’s see a demo/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/This is a sample/)).toHaveTextContent("nothing you do is uploaded and no AI runs");
  });

  it("closes the welcome with Escape", () => {
    render(<DemoTour />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(railStop("Upload")).toHaveAttribute("aria-current", "step");
  });

  it("keeps the later stops locked until the basics are done", () => {
    start();
    expect(railStop("Clean, opens after Check")).toBeInTheDocument();
    fireEvent.click(railStop("Report, opens after the basics"));
    expect(railStop("Upload")).toHaveAttribute("aria-current", "step");
    expect(guide()).toContain("opens after the basics");
  });

  it("walks the three basics, then opens everything", () => {
    start();
    fireEvent.click(stage().getByRole("button", { name: "Drop it in" }));
    wait(1500);
    expect(stage().getByText(`${FILE.rows.toLocaleString("en-US")} rows`)).toBeInTheDocument();
    expect(popIn()).toContain(`${FILE.rows.toLocaleString("en-US")} rows and ${FILE.columns} columns`);

    fireEvent.click(screen.getByRole("button", { name: /Next: Check/ }));
    const cards = stage().getAllByRole("button", { pressed: false });
    expect(cards).toHaveLength(3);
    cards.forEach(c => fireEvent.click(c));
    expect(stage().getAllByRole("button", { pressed: true })).toHaveLength(3);
    expect(guide()).toContain("You found them all");

    fireEvent.click(screen.getByRole("button", { name: /Next: Clean/ }));
    fireEvent.click(stage().getByRole("button", { name: "Clean it" }));
    expect(stage().getByText(FILE.cleanRows.toLocaleString("en-US"))).toBeInTheDocument();
    expect(stage().getByRole("link", { name: /Download the cleaned file/ })).toHaveAttribute("href", "/demo/cleaned_coffee_sales.csv");

    fireEvent.click(screen.getByRole("button", { name: /Next: Explore/ }));
    expect(popIn()).toContain("The whole demo is open now");
    expect(railStop("Report")).toBeInTheDocument();
    goTo("Report");
    expect(railStop("Report")).toHaveAttribute("aria-current", "step");
  });

  it("lets the visitor skip the basics", () => {
    startExploring();
    expect(railStop("Explore")).toHaveAttribute("aria-current", "step");
    expect(railStop("Take it home")).toBeInTheDocument();
  });

  it("asks what the file is, and is kind about a wrong guess", () => {
    startExploring();
    goTo("What is it?");
    fireEvent.click(stage().getByRole("button", { name: /Football match scores/ }));
    expect(guide()).toContain("not goals");
    expect(stage().queryByText(`“${sample.focus}”`)).toBeNull();
    fireEvent.click(stage().getByRole("button", { name: /Sales from a coffee chain/ }));
    expect(stage().getByText(`“${sample.focus}”`)).toBeInTheDocument();
  });

  it("shows where an underlined number comes from", () => {
    startExploring();
    goTo("Report");
    for (const e of EVIDENCE) {
      fireEvent.click(stage().getByRole("button", { name: e.text }));
      expect(stage().getByText(plain(e.plain))).toBeInTheDocument();
    }
  });

  it("hides, moves and undoes, saving a version each time", () => {
    startExploring();
    goTo("Report");
    const [first, second] = sample.report.insights;
    const titles = () => stage().getAllByRole("heading", { level: 4 }).map(h => h.textContent);
    expect(stage().getByText("Version 1")).toBeInTheDocument();

    fireEvent.click(stage().getByRole("button", { name: `Move down: ${first.title}` }));
    expect(titles().indexOf(second.title)).toBeLessThan(titles().indexOf(first.title));
    expect(stage().getByText("Version 2")).toBeInTheDocument();

    fireEvent.click(stage().getByRole("button", { name: `Hide: ${first.title}` }));
    expect(titles()).not.toContain(first.title);
    expect(stage().getByRole("button", { name: `Show again: ${first.title}` })).toBeInTheDocument();
    expect(stage().getByText("Version 3")).toBeInTheDocument();

    fireEvent.click(stage().getByRole("button", { name: /Undo/ }));
    expect(titles()).toContain(first.title);
    expect(stage().getByText("Version 2")).toBeInTheDocument();
  });

  it("renames the report", () => {
    startExploring();
    goTo("Report");
    fireEvent.click(stage().getByRole("button", { name: /Rename/ }));
    const box = stage().getByRole("textbox");
    fireEvent.change(box, { target: { value: "Our coffee year" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(stage().getByRole("heading", { level: 3, name: "Our coffee year" })).toBeInTheDocument();
  });

  it("opens a chart large, and closes it with Escape", () => {
    startExploring();
    goTo("Report");
    const chart = sample.report.insights[1].chart;
    const open = stage().getByRole("button", { name: `Enlarge the chart: ${chart.label}` });
    fireEvent.click(open);
    expect(screen.getByRole("dialog", { name: chart.label })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("loads the charts before the report is opened, so none is blank on arrival", () => {
    start();
    const loading = () => [...document.querySelectorAll(".dg-chart img")].map(i => i.getAttribute("loading"));
    expect(new Set(loading())).toEqual(new Set(["lazy"]));
    fireEvent.click(screen.getByRole("button", { name: /Skip the basics/ }));
    expect(loading()).toHaveLength(sample.report.insights.length);
    expect(new Set(loading())).toEqual(new Set(["eager"]));
  });

  it("keeps the Enlarge label off the chart", () => {
    startExploring();
    goTo("Report");
    const css = readFileSync(path.join(ROOT, "app/demo/demoStyles.ts"), "utf-8");
    expect(css.match(/\.dg-zoomtag \{[^}]*\}/)![0]).not.toContain("absolute");
    expect(stage().getAllByText("Enlarge")).toHaveLength(sample.report.insights.length);
  });

  it("takes the Done note away by itself, and lets a press through it", () => {
    startExploring();
    expect(popIn()).toContain("Done!");
    wait(3700);
    expect(popIn()).toBe("");
    const css = readFileSync(path.join(ROOT, "app/demo/demoStyles.ts"), "utf-8");
    expect(css.match(/\.dg-pop-zone \{[^}]*\}/)![0]).toContain("pointer-events: none");
    expect(css.match(/\.dg-pop \{[^}]*\}/)![0]).not.toContain("pointer-events");
  });

  it("shows team editing on Pro only, with a teammate saving live", () => {
    startExploring();
    goTo("Report");
    expect(stage().queryByRole("button", { name: "Watch a teammate edit" })).toBeNull();
    headerPlan("Pro");
    fireEvent.click(stage().getByRole("button", { name: "Watch a teammate edit" }));
    wait(2500);
    expect(stage().getByText(/Saved by Sam/)).toBeInTheDocument();
    expect(popIn()).toContain("Sam moved a finding up");
  });
});

describe("working together", () => {
  function openTeam() {
    startExploring();
    goTo("Work together");
    return stage().getByRole("region", { name: "The report, open for the team (view only)" });
  }

  it("shows the team at the top, each person with a role and whether they are here", () => {
    openTeam();
    const team = stage().getByRole("list", { name: "The team" });
    expect(within(team).getAllByRole("listitem")).toHaveLength(TEAM.length);
    // Pro teams are up to 5 people, and these are the app's three roles.
    expect(TEAM.length).toBeLessThanOrEqual(5);
    expect(new Set(TEAM.map(m => m.role))).toEqual(new Set(ROLES.map(r => r.role)));
    expect(ROLES.map(r => r.role)).toEqual(["Owner", "Editor", "Viewer"]);
    for (const m of TEAM) expect(within(team).getByText(m.name, { selector: "strong" }).parentElement).toHaveTextContent(m.role);
    expect(team).toHaveTextContent("Away · seen 2 h ago");
    expect(stage().getByText("Reads the report and comments on it.")).toBeInTheDocument();
  });

  it("says it is a simulated preview, on the map and on the stop", () => {
    startExploring();
    expect(stage().getByText(/^A simulated team preview/)).toBeInTheDocument();
    openTeam();
    expect(stage().getByText(/^A simulated preview with a made-up team/)).toBeInTheDocument();
    expect(stage().getByText("Simulated preview · view only")).toBeInTheDocument();
  });

  it("plays a live session: people arrive, Sam types, Leo comments, Priya moves a finding", () => {
    const doc = openTeam();
    expect(stage().getByLabelText("Here now: You")).toBeInTheDocument();
    wait(1500);
    expect(stage().getByLabelText("Here now: You, Sam, Priya, Leo")).toBeInTheDocument();
    wait(1000);
    expect(within(doc).getByLabelText("Sam’s cursor")).toBeInTheDocument();
    expect(within(doc).getByLabelText("Leo’s cursor")).toBeInTheDocument();

    wait(4000);
    expect(doc).toHaveTextContent(TYPED.trim());
    expect(stage().getByText(/Version 2 · Saved by Sam/)).toBeInTheDocument();
    expect(stage().getByText(COMMENT.text)).toBeInTheDocument();

    wait(4000);
    const titles = within(doc).getAllByRole("heading", { level: 4 }).map(h => h.textContent ?? "");
    expect(titles[1]).toContain(sample.report.insights[2].title);
    expect(stage().getByText(/Version 3 · Saved by Priya/)).toBeInTheDocument();
    expect(stage().getByText(REPLY.text)).toBeInTheDocument();
    expect(guide()).toContain("Pro teams");
  });

  it("lets the visitor watch, never write", () => {
    const doc = openTeam();
    wait(10000);
    expect(stage().queryAllByRole("textbox")).toHaveLength(0);
    expect(document.querySelector(".dg-stage:not([hidden]) [contenteditable]")).toBeNull();
    const before = doc.textContent;
    fireEvent.click(doc);
    expect(stage().getByRole("status")).toHaveTextContent("View only");
    expect(guide()).toContain("Look, don’t touch");
    expect(doc.textContent).toBe(before);
  });

  it("plays the session again from the start", () => {
    openTeam();
    expect(stage().getByRole("button", { name: /Play it again/ })).toBeDisabled();
    wait(10000);
    fireEvent.click(stage().getByRole("button", { name: /Play it again/ }));
    expect(stage().getByLabelText("Here now: You")).toBeInTheDocument();
    expect(stage().getByText(/Version 1 · All changes saved/)).toBeInTheDocument();
    wait(10000);
    expect(stage().getByText(/Version 3 · Saved by Priya/)).toBeInTheDocument();
  });

  it("comments on words that are in the report, and types no figures", () => {
    expect(sample.report.summary).toContain(PHRASE);
    expect(TYPED).not.toMatch(/\d/);
  });
});

describe("asking DIG", () => {
  it("answers each question from the sample run, and says no to the off-topic one", () => {
    startExploring();
    goTo("Ask");
    const labels: Record<string, string> = { data: "Looked up in the file", analysis: "From the analysis", refused: "Outside the data · declined" };
    for (const a of sample.answers) {
      fireEvent.click(stage().getByRole("button", { name: a.q }));
      wait(400);
      expect(stage().getByLabelText("DIG is typing")).toBeInTheDocument();
      expect(stage().queryByText(plain(a.a))).toBeNull();
      wait(500);
      expect(stage().getByText(plain(a.a))).toBeInTheDocument();
      expect(stage().getAllByText(labels[a.source]).length).toBeGreaterThan(0);
    }
    expect(stage().getAllByRole("button", { name: /Add to report/ })).toHaveLength(
      sample.answers.filter(a => a.source !== "refused").length,
    );
  });

  it("adds an answer to the report as a note", () => {
    startExploring();
    goTo("Ask");
    const answer = sample.answers[0];
    fireEvent.click(stage().getByRole("button", { name: answer.q }));
    wait(900);
    fireEvent.click(stage().getByRole("button", { name: /Add to report/ }));
    expect(popIn()).toContain("Added to the report");
    goTo("Report");
    expect(stage().getByText("FROM YOUR QUESTIONS")).toBeInTheDocument();
    expect(stage().getAllByText(plain(answer.a), { exact: false }).length).toBeGreaterThan(0);
  });

  it("explains the daily question limit for each plan", () => {
    startExploring();
    goTo("Ask");
    expect(stage().getByText(`${PLANS.free.questions} of ${PLANS.free.questions} left today on Free`)).toBeInTheDocument();
    headerPlan("Pro");
    expect(stage().getByText(`${PLANS.pro.questions} of ${PLANS.pro.questions} left today on Pro`)).toBeInTheDocument();
  });
});

describe("the plans and the files", () => {
  it("locks the Pro features on Free and opens them on Pro", () => {
    startExploring();
    goTo("Free or Pro");
    // Named here, not read from demoFacts, so a feature made free by mistake fails.
    const proOnly = [
      "Word and PowerPoint reports",
      "Steer the report: focus, assumptions, your questions, language, tone",
      "Edit together, live, as a team",
      "Priority support",
    ];
    expect(PLAN_FEATURES.filter(f => f.pro).map(f => f.name)).toEqual(proOnly);
    for (const name of proOnly) expect(stage().getByText(name).parentElement).toHaveTextContent("(Pro only)");
    expect(stage().getByText(PLANS.free.price)).toBeInTheDocument();

    fireEvent.click(within(stage().getByRole("group", { name: "Plan" })).getByRole("button", { name: "Pro" }));
    for (const name of proOnly) expect(stage().getByText(name).parentElement).toHaveTextContent("(included)");
    expect(stage().getByText(PLANS.pro.price)).toBeInTheDocument();
    expect(stage().getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/register");
    expect(stage().getByRole("link", { name: "See the plans" })).toHaveAttribute("href", "/plans");
  });

  it("offers the real files, marking Word and PowerPoint as Pro on Free", () => {
    startExploring();
    goTo("Take it home");
    const links = stage().getAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/demo/"));
    expect(links.map(a => a.getAttribute("href"))).toEqual(FILES.map(f => f.href));
    for (const f of FILES) {
      const card = links.find(a => a.getAttribute("href") === f.href)!;
      expect(card).toHaveAttribute("download");
      expect(card).toHaveTextContent(f.pro ? "Pro · sample to try" : "Free and Pro");
    }
    headerPlan("Pro");
    expect(stage().getAllByText("Included on Pro")).toHaveLength(FILES.filter(f => f.pro).length);
    expect(stage().getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/register");
  });

  it("never calls the server, whatever the visitor presses", () => {
    start();
    fireEvent.click(stage().getByRole("button", { name: "Drop it in" }));
    wait(1500);
    fireEvent.click(screen.getByRole("button", { name: /Skip the basics/ }));
    for (const label of ["What is it?", "Report", "Ask", "Work together", "Free or Pro", "Take it home"]) {
      goTo(label);
      stage().queryAllByRole("button").slice(0, 6).forEach(b => fireEvent.click(b));
      wait(3000);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("symbols", () => {
  // Neither of the site's fonts has these, so each came from whatever the
  // visitor's computer offered, and on some that was an empty box.
  it.each(["DemoTour.tsx", "stops.tsx", "TeamStop.tsx", "DigFigure.tsx"])("are drawn, not typed, in %s", file => {
    expect(readFileSync(path.join(ROOT, "app/demo", file), "utf-8")).not.toMatch(/[↻↶✎⤢＋☾☀✓✦★▶]|👁|🔒/u);
  });
});

describe("finding the demo", () => {
  it("has a button on the landing page, in all three languages", () => {
    const landing = readFileSync(path.join(ROOT, "app/page.tsx"), "utf-8");
    expect(landing).toContain('<Link href="/demo"');
    expect(landing).toContain("demo: 'Try the interactive demo'");
    expect(landing).toContain("demo: 'Essayer la démo interactive'");
    expect(landing).toContain("demo: 'امتحان دموی تعاملی'");
  });

  it("is in the sitemap", () => {
    expect(sitemap().some(e => e.url.endsWith("/demo"))).toBe(true);
  });
});
