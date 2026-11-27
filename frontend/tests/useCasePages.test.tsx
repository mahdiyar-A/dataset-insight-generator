import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

/**
 * The pages written for one search each: SPSS without SPSS, Parquet to a
 * report, and duplicate survey rows. A page like this is only worth having if
 * every promise on it is true, so the promises that could drift are checked
 * against the code that keeps them.
 */

vi.mock("@/app/home/homeStyles", () => ({ HOME_CSS: "" }));
vi.mock("@/app/home/useCaseStyles", () => ({ USE_CASE_CSS: "" }));
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

import UseCasePage, { metadataFor } from "@/app/home/UseCasePage";
import SiteFooter from "@/app/home/SiteFooter";
import { IS_IT_FREE, UPLOAD_MB, USE_CASES, USE_CASE_LIST } from "@/app/home/useCases";
import { PLANS } from "@/app/demo/demoFacts";
import { UPLOAD_EXTENSIONS } from "@/lib/uploadFormats";
import sitemap from "@/app/sitemap";

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf-8");

describe.each(USE_CASE_LIST.map(p => [p.path, p] as const))("the page at %s", (route, page) => {
  it("is a real route", () => {
    expect(existsSync(path.join(ROOT, "app", route.slice(1), "page.tsx"))).toBe(true);
  });

  it("answers the search in its title, and leads to sign-up and the demo", () => {
    render(<UseCasePage page={page} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(page.h1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const hero = within(document.querySelector<HTMLElement>(".uc-hero")!);
    expect(hero.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/register");
    expect(hero.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
  });

  it("names only file types the upload form takes", () => {
    for (const ext of page.exts) expect(UPLOAD_EXTENSIONS).toContain(ext);
  });

  it("shows a real report, its questions and what to know first", () => {
    const { container } = render(<UseCasePage page={page} />);
    // The sample report window is pressable, so it is a group, not a picture.
    expect(screen.getByRole("group", { name: /report/i })).toBeInTheDocument();
    expect(container.querySelectorAll("#faq details")).toHaveLength(page.faq.length);
    expect(container.querySelectorAll(".uc-limits li")).toHaveLength(page.limits.length);
    expect(container.querySelectorAll(".uc-steps li")).toHaveLength(4);
  });

  it("links to the other pages, so each can be found from the next", () => {
    render(<UseCasePage page={page} />);
    const more = within(document.getElementById("more")!);
    for (const other of USE_CASE_LIST.filter(p => p !== page)) {
      expect(more.getByRole("link", { name: new RegExp(other.eyebrow) })).toHaveAttribute("href", other.path);
    }
  });

  it("fits a search result, and says which address is the real one", () => {
    const meta = metadataFor(page);
    expect(page.title.length).toBeLessThanOrEqual(65);
    expect(page.description.length).toBeLessThanOrEqual(160);
    expect(meta.alternates?.canonical).toBe(route);
    expect(meta.title).toEqual({ absolute: page.title });
  });

  it("says nothing about how the site is built", () => {
    const { container } = render(<UseCasePage page={page} />);
    expect(container.textContent).not.toMatch(/HTTPS|JWT|Supabase|\bAPI\b|Stripe|pandas|pyreadstat/);
  });
});

describe("what the pages promise", () => {
  it("gives every page its own title and description", () => {
    expect(new Set(USE_CASE_LIST.map(p => p.title)).size).toBe(USE_CASE_LIST.length);
    expect(new Set(USE_CASE_LIST.map(p => p.description)).size).toBe(USE_CASE_LIST.length);
  });

  it("states the same upload limit the server enforces", () => {
    expect(UPLOAD_MB).toBe(50);
    expect(read("backend/Application/Services/UploadIntake.cs")).toContain(`exceeds the ${UPLOAD_MB} MB limit`);
  });

  it("keeps SPSS answer labels, because the reader applies them", () => {
    expect(read("ai_service/ai_engine/ingest/loader.py")).toMatch(/read_sav\(path, apply_value_formats=True\)/);
    expect(JSON.stringify(USE_CASES.spss)).toContain("labels");
  });

  it("removes only exact repeats, after trimming spaces, as the cleaner does", () => {
    expect(read("ai_service/ai_engine/core/cleaner.py")).toContain("df.drop_duplicates(inplace=True)");
    const loader = read("ai_service/ai_engine/ingest/loader.py").replace(/\s+/g, " ");
    expect(loader).toContain("surrounding whitespace trimmed from text");
    expect(USE_CASES.duplicates.limits[0]).toMatch(/^Only exact repeats are removed/);
  });

  it("puts the charts on the slides, as the PowerPoint builder does", () => {
    expect(read("ai_service/ai_engine/pptx/pptx_builder.py")).toContain("slide.shapes.add_picture(");
  });

  it("quotes the plans as they are", () => {
    expect(IS_IT_FREE).toContain(`${PLANS.free.window.count} analyses every ${PLANS.free.window.hours} hours`);
    expect(IS_IT_FREE).toContain(PLANS.pro.price);
  });

  it("lists every page in the sitemap", () => {
    const urls = sitemap().map(entry => new URL(entry.url).pathname);
    for (const page of USE_CASE_LIST) expect(urls).toContain(page.path);
  });

  it("links every page from the footer, whose page links work from any page", () => {
    const { container } = render(<SiteFooter lang="fr" />);
    const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href")!);
    for (const page of USE_CASE_LIST) expect(hrefs).toContain(page.path);
    expect(hrefs.filter(h => h.startsWith("#"))).toEqual([]);
  });
});
