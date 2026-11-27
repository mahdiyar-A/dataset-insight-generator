import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL } from "@/app/home/homeCopy";

/**
 * DIG is reached at one address on its own domain, which Namecheap forwards to
 * the owner's inbox. The site, the dashboard, the legal pages and the server's
 * emails all have to give the same one.
 */

const REPO = path.resolve(__dirname, "../..");
const SUPPORT = "support@datainsightgen.com";

const sources = (dir: string): string[] =>
  readdirSync(path.join(REPO, dir), { recursive: true, encoding: "utf8" })
    .filter(f => /\.(tsx?|jsx?|cs|json)$/.test(f) && !/(^|[\\/])(node_modules|bin|obj|\.next)([\\/]|$)/.test(f))
    .map(f => path.join(dir, f));

describe("the contact address", () => {
  it("is the support address on DIG's own domain", () => {
    expect(CONTACT_EMAIL).toBe(SUPPORT);
  });

  it("is the one the server gives and replies go to", () => {
    const plans = readFileSync(path.join(REPO, "backend/Controllers/PlansController.cs"), "utf-8");
    const mail = readFileSync(path.join(REPO, "backend/Infrastructure/Email/SmtpEmailService.cs"), "utf-8");
    expect(plans).toContain(`SupportEmail = "${SUPPORT}"`);
    expect(mail).toContain(`?? "${SUPPORT}"`);
  });

  it("no longer gives the old personal inbox anywhere", () => {
    const files = [...sources("frontend/app"), ...sources("frontend/components"), ...sources("backend")];
    expect(files.length).toBeGreaterThan(50);
    const stale = files.filter(f => /proton\.me/i.test(readFileSync(path.join(REPO, f), "utf-8")));
    expect(stale).toEqual([]);
  });
});
