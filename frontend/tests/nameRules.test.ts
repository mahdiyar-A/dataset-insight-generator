import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isFirstNameOk, isLastNameOk } from "@/lib/nameRules";

/**
 * Sign-up used to accept only A to Z, which turned away O'Connor, Anne-Marie,
 * François and anyone typing their name in Persian.
 */

describe("the names sign-up accepts", () => {
  it("takes real names in any script, with their apostrophes, hyphens, accents and dots", () => {
    for (const name of ["Mahdiyar", "O'Connor", "O’Brien", "Anne-Marie", "François", "Zoë", "José", "J.", "مهدیار", "李", "Ngũgĩ"]) {
      expect(isFirstNameOk(name), name).toBe(true);
      expect(isLastNameOk(name), name).toBe(true);
    }
  });

  it("takes a space in a last name, not in a first name (the account splits at the first space)", () => {
    expect(isLastNameOk("van der Berg")).toBe(true);
    expect(isFirstNameOk("Mary Ann")).toBe(false);
    expect(isLastNameOk("van  der Berg")).toBe(false);
  });

  it("still turns away what is not a name", () => {
    for (const bad of ["", "   ", "123", "R2D2", "-Anne", "'x", "<script>", "a@b", "Robert');", "x".repeat(31)]) {
      expect(isFirstNameOk(bad), bad).toBe(false);
      expect(isLastNameOk(bad), bad).toBe(false);
    }
  });
});

describe("the legal pages", () => {
  it("carry no notes meant for the owner", () => {
    for (const page of ["app/privacy/page.tsx", "app/terms/page.tsx"]) {
      const text = readFileSync(path.resolve(__dirname, "..", page), "utf8");
      expect(text, page).not.toMatch(/paying customers|charging customers|reviewed by a lawyer/);
    }
  });
});
