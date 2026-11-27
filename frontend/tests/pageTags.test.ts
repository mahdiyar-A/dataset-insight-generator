import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import sitemap from "@/app/sitemap";
import { metadata as plans } from "@/app/plans/layout";
import { metadata as register } from "@/app/register/layout";
import { metadata as login } from "@/app/login/layout";
import { metadata as forgot } from "@/app/forgot-password/layout";

/**
 * The tags search engines read. The root layout's canonical is "/", and a page
 * that does not set its own inherits it, which tells Google the page is a copy
 * of the homepage. That kept Pricing out of search results until 2026-11-27.
 */

const app = path.resolve(__dirname, "../app");
const source = (route: string) =>
  ["layout.tsx", "page.tsx"]
    .map(file => path.join(app, route, file))
    .filter(existsSync)
    .map(file => readFileSync(file, "utf8"))
    .join("\n");

describe("the tags search engines read", () => {
  it("give every page in the sitemap its own canonical", () => {
    const paths = sitemap().map(entry => new URL(entry.url).pathname).filter(p => p !== "/");
    expect(paths.length).toBeGreaterThan(5);
    for (const p of paths) {
      const own = new RegExp(`canonical: ['"]${p}['"]|metadataFor\\(`);
      expect(source(p), p).toMatch(own);
    }
  });

  it("let Pricing and sign-up be found, each as itself", () => {
    expect(plans.alternates?.canonical).toBe("/plans");
    expect(register.alternates?.canonical).toBe("/register");
    expect(plans.robots).toBeUndefined();
    expect(register.robots).toBeUndefined();
  });

  it("keep the login and reset forms out of search and out of the sitemap", () => {
    for (const [page, route] of [[login, "/login"], [forgot, "/forgot-password"]] as const) {
      expect(page.robots).toMatchObject({ index: false });
      expect(page.alternates?.canonical).toBe(route);
      expect(sitemap().some(entry => new URL(entry.url).pathname === route)).toBe(false);
    }
  });
});
