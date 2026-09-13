/**
 * Which elements have scrolled far enough to be revealed.
 *
 * This lives outside the component on purpose. Two earlier attempts at
 * scroll reveals shipped broken because the only way to check them was to eyeball
 * a running page:
 *
 *   1. A CSS view timeline using `animation-range: entry 6% cover 24%`. Mixing
 *      two range names collapses the range at a short viewport, and every
 *      animation reported playState "finished" while its element sat far below
 *      the fold — so nothing was ever hidden.
 *   2. IntersectionObserver, which only reports while the page is actually
 *      being rendered and therefore cannot be exercised headlessly at all.
 *
 * A rect comparison is dull, deterministic, and — because it is a pure
 * function of numbers — can be tested without a browser.
 */

/**
 * How far down the viewport an element's top edge must reach before it counts
 * as arrived. Below 1 so an element animates while entering rather than only
 * once its top touches the very bottom edge.
 */
export const REVEAL_FRACTION = 0.92;

export interface RevealRect {
  top: number;
  bottom: number;
}

/**
 * True once the element's top edge has crossed the reveal line.
 *
 * Deliberately ignores `bottom`. An earlier version also required
 * `bottom > 0` — "still on screen" — which left everything above the viewport
 * permanently hidden after a jump to an anchor like #contact, because those
 * elements were skipped over rather than scrolled through. Anything already
 * past the line has been reached, whichever direction the reader arrived from.
 */
export function isRevealed(rect: RevealRect, viewportHeight: number): boolean {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;
  return rect.top < viewportHeight * REVEAL_FRACTION;
}

/**
 * Partition a list into the elements to reveal now and those still waiting.
 * Returning both keeps the caller's pending list shrinking, so a long page
 * stops doing work once everything has been shown.
 */
export function partitionRevealed<T>(
  items: T[],
  rectOf: (item: T) => RevealRect,
  viewportHeight: number,
): { reveal: T[]; pending: T[] } {
  const reveal: T[] = [];
  const pending: T[] = [];
  for (const item of items) {
    if (isRevealed(rectOf(item), viewportHeight)) reveal.push(item);
    else pending.push(item);
  }
  return { reveal, pending };
}
