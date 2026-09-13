import { describe, expect, it } from "vitest";

import { isVisible, partitionVisible, REVEAL_FRACTION } from "@/lib/revealOnScroll";

/**
 * The landing page hides these elements with JavaScript and shows them on
 * scroll, so a mistake here does not look like a broken animation — it looks
 * like a blank marketing page. Hence the coverage on an otherwise trivial
 * comparison.
 */

const VH = 800;
const line = VH * REVEAL_FRACTION; // 736

describe("isVisible", () => {
  it("hides an element below the fold", () => {
    expect(isVisible({ top: 2620, bottom: 2700 }, VH)).toBe(false);
  });

  it("shows an element in the middle of the viewport", () => {
    expect(isVisible({ top: 300, bottom: 460 }, VH)).toBe(true);
  });

  it("shows as soon as the top edge crosses the reveal line", () => {
    expect(isVisible({ top: line - 1, bottom: line + 200 }, VH)).toBe(true);
    expect(isVisible({ top: line + 1, bottom: line + 200 }, VH)).toBe(false);
  });

  it("hides again once the element has scrolled off the top", () => {
    // The reveal is repeatable: leaving the viewport upward fades it back out,
    // so scrolling down and up again replays the entrance.
    expect(isVisible({ top: -1500, bottom: -1200 }, VH)).toBe(false);
  });

  it("still shows an element straddling the top edge", () => {
    expect(isVisible({ top: -120, bottom: 40 }, VH)).toBe(true);
  });

  it("shows nothing when the viewport cannot be measured", () => {
    // A zero viewport is a hidden tab or unsettled layout. Treating it as
    // "everything visible" unhid the page permanently on a momentary zero
    // during layout; the caller has a rescue timer for a viewport that never
    // becomes measurable at all.
    expect(isVisible({ top: 10, bottom: 90 }, 0)).toBe(false);
    expect(isVisible({ top: 10, bottom: 90 }, Number.NaN)).toBe(false);
  });
});

describe("partitionVisible", () => {
  const rectOf = (r: { top: number; bottom: number }) => r;

  it("splits a page into on-screen and off-screen", () => {
    const items = [
      { top: 0, bottom: 60 },       // on screen
      { top: 500, bottom: 620 },    // on screen
      { top: 1400, bottom: 1500 },  // below
      { top: -900, bottom: -800 },  // scrolled past above
    ];
    const { visible, hidden } = partitionVisible(items, rectOf, VH);
    expect(visible).toHaveLength(2);
    expect(hidden).toHaveLength(2);
    expect(hidden.map(h => h.top)).toEqual([1400, -900]);
  });

  it("treats everything as hidden when the viewport is zero", () => {
    const items = [{ top: 0, bottom: 60 }, { top: 900, bottom: 1000 }];
    const { visible, hidden } = partitionVisible(items, rectOf, 0);
    expect(visible).toHaveLength(0);
    expect(hidden).toHaveLength(2);
  });

  it("re-shows an element that scrolls back into the band", () => {
    const item = { top: 2000, bottom: 2100 };
    expect(partitionVisible([item], rectOf, VH).visible).toHaveLength(0);
    // The reader scrolls down; the same element is now on screen.
    const onScreen = { top: 200, bottom: 300 };
    expect(partitionVisible([onScreen], rectOf, VH).visible).toHaveLength(1);
  });
});
