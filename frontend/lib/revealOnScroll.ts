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
 * True while the element is within the band that should be shown.
 *
 * Reveals are repeatable rather than one-shot: an element fades out again once
 * it has left the viewport and fades back in on return, in either direction.
 * That is why `bottom` matters — `bottom > 0` is what makes an element hide
 * after scrolling off the top.
 *
 * Because the state is recomputed from the rect on every pass rather than
 * latched, arriving somewhere by an anchor jump needs no special handling: the
 * sections skipped over are simply out of band, and reveal normally when the
 * reader scrolls back to them.
 */
export function isVisible(rect: RevealRect, viewportHeight: number): boolean {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;
  return rect.bottom > 0 && rect.top < viewportHeight * REVEAL_FRACTION;
}

/**
 * Split a list by whether each item is currently in the visible band.
 *
 * Both halves are returned because the caller has to act on both: items that
 * entered are shown, items that left are hidden again.
 */
export function partitionVisible<T>(
  items: T[],
  rectOf: (item: T) => RevealRect,
  viewportHeight: number,
): { visible: T[]; hidden: T[] } {
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const item of items) {
    if (isVisible(rectOf(item), viewportHeight)) visible.push(item);
    else hidden.push(item);
  }
  return { visible, hidden };
}
