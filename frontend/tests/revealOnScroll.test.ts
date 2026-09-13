import { describe, expect, it } from "vitest";

import { isRevealed, partitionRevealed, REVEAL_FRACTION } from "@/lib/revealOnScroll";

/**
 * The landing page hides these elements with JavaScript and reveals them on
 * scroll, so a mistake here does not look like a broken animation — it looks
 * like a blank marketing page. Hence the coverage on an otherwise trivial
 * comparison.
 */

const VH = 800;
const line = VH * REVEAL_FRACTION; // 736

describe("isRevealed", () => {
  it("hides an element below the fold", () => {
    expect(isRevealed({ top: 2620, bottom: 2700 }, VH)).toBe(false);
  });

  it("reveals an element in the middle of the viewport", () => {
    expect(isRevealed({ top: 300, bottom: 460 }, VH)).toBe(true);
  });

  it("reveals as soon as the top edge crosses the reveal line", () => {
    expect(isRevealed({ top: line - 1, bottom: line + 200 }, VH)).toBe(true);
    expect(isRevealed({ top: line + 1, bottom: line + 200 }, VH)).toBe(false);
  });

  it("reveals an element already scrolled past above the viewport", () => {
    // Risk: the first version also required bottom > 0. Jumping straight to an
    // anchor such as #contact skips over everything above it, leaving those
    // elements permanently invisible — the reader scrolls back up to blanks.
    expect(isRevealed({ top: -1500, bottom: -1200 }, VH)).toBe(true);
  });

  it("reveals nothing when the viewport cannot be measured", () => {
    // A zero viewport is a hidden tab or unsettled layout. Revealing on it
    // would unhide the page permanently on a momentary zero; the caller has a
    // separate rescue timer for a viewport that never becomes measurable.
    expect(isRevealed({ top: 10, bottom: 90 }, 0)).toBe(false);
    expect(isRevealed({ top: 10, bottom: 90 }, Number.NaN)).toBe(false);
  });
});

describe("partitionRevealed", () => {
  const rectOf = (r: { top: number; bottom: number }) => r;

  it("splits a page into arrived and waiting", () => {
    const items = [
      { top: 0, bottom: 60 },       // on screen
      { top: 500, bottom: 620 },    // on screen
      { top: 1400, bottom: 1500 },  // below
      { top: 3000, bottom: 3100 },  // far below
    ];
    const { reveal, pending } = partitionRevealed(items, rectOf, VH);
    expect(reveal).toHaveLength(2);
    expect(pending).toHaveLength(2);
    expect(pending[0].top).toBe(1400);
  });

  it("keeps everything pending when the viewport is zero", () => {
    const items = [{ top: 0, bottom: 60 }, { top: 900, bottom: 1000 }];
    const { reveal, pending } = partitionRevealed(items, rectOf, 0);
    expect(reveal).toHaveLength(0);
    expect(pending).toHaveLength(2);
  });

  it("empties the pending list once the page is fully scrolled", () => {
    const items = [{ top: -900, bottom: -800 }, { top: -100, bottom: 40 }];
    const { reveal, pending } = partitionRevealed(items, rectOf, VH);
    expect(reveal).toHaveLength(2);
    expect(pending).toHaveLength(0);
  });
});
