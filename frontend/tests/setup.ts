import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount anything a test rendered. Without this, queries in a later test can
// match nodes left behind by an earlier one and pass for the wrong reason.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom implements neither of these, and components that call them throw.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom has no layout engine, so getBoundingClientRect returns all zeros. The
// workspace cursor code divides by rect.width, which would be a division by
// zero. Give it a deterministic 1000x500 box.
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 500,
    width: 1000, height: 500,
    toJSON: () => ({}),
  } as DOMRect;
};

// Components read this at module load. A missing value makes them fall back to
// localhost, which is fine, but being explicit keeps assertions on request URLs
// stable.
process.env.NEXT_PUBLIC_API_BASE_URL = "http://test.local";
