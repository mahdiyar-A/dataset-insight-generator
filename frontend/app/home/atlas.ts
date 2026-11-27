/**
 * The landing page's palette and faces, shared by the page and its sections.
 */

// `cobalt` is a SURFACE that carries white text, so it stays deep in both
// themes — white on a lifted indigo lands near 2.9:1, under the 4.5 minimum.
// `cobaltAccent` is the same hue as TEXT on the page ground, where the
// relationship inverts: deep cobalt reads at 2.3:1 against dark paper, so the
// dark theme lifts it. One hue, two jobs, two values.
export const ATLAS = {
  light: {
    paper: '#f2efe9', paperAlt: '#e9e5dd', ink: '#12121a',
    // inkFaint is darker than it looks like it needs to be: the eyebrow labels
    // use it at 11.5px over the tinted ground, where #6b6862 measured 4.42:1.
    inkSoft: '#4a4741', inkFaint: '#66635d',
    rule: '#12121a', hairline: 'rgba(18,18,26,0.16)',
    cobalt: '#2536e0', cobaltAccent: '#2536e0',
    lime: '#d6f24a', card: '#ffffff',
  },
  // Ink-blue rather than near-black. A true black ground under a cobalt hero
  // reads as an absence — the page looked like it had holes in it. These carry
  // the same hue family as the accent, so the dark theme is a dim version of
  // the palette instead of a different, colourless one.
  dark: {
    paper: '#151a2b', paperAlt: '#1b2138', ink: '#f2efe9',
    inkSoft: '#bcc2d4', inkFaint: '#8e96ad',
    rule: '#f2efe9', hairline: 'rgba(242,239,233,0.18)',
    cobalt: '#2536e0', cobaltAccent: '#8b95f5',
    lime: '#d6f24a', card: '#1e2440',
  },
} as const;

export type Palette = (typeof ATLAS)['light'] | (typeof ATLAS)['dark'];

// The paper sheet that overlaps the hero is cream in BOTH themes. Letting it
// follow the dark theme turned it into a black slab sitting on the cobalt
// field — the palette's whole point is paper against blue against citron.
export const SHEET = { bg: '#f2efe9', ink: '#12121a', soft: '#4a4741', accent: '#2536e0' };

export const DISPLAY = 'var(--font-display), "Bricolage Grotesque", Georgia, serif';
export const SANS = 'var(--font-sans), "Work Sans", system-ui, sans-serif';
