import type { ReactNode } from 'react';

/**
 * Small line icons, drawn inline.
 *
 * These used to be characters (↻ ↶ ✎ ⤢ ＋ ✓). Neither of the site's fonts has
 * them, so each one came from whatever the visitor's computer happened to
 * offer, and on a computer with no symbol font it was an empty box. A drawing
 * in the page cannot fail to load.
 *
 * Every icon takes the colour of the text around it, and is hidden from screen
 * readers: the words beside it, or the button's label, already say it.
 */

type Props = { size?: number };

function Icon({ size = 14, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, verticalAlign: '-0.12em' }}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: Props) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;

export const PlusIcon = (p: Props) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;

/** Turn around: flip a card, play again. */
export const FlipIcon = (p: Props) => (
  <Icon {...p}><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20.5 2.5v5h-5" /></Icon>
);

export const UndoIcon = (p: Props) => (
  <Icon {...p}><path d="M4 9h10a6 6 0 0 1 0 12h-4" /><path d="M8.5 4 3.5 9l5 5" /></Icon>
);

export const PencilIcon = (p: Props) => (
  <Icon {...p}><path d="M4 20l1.2-4.6L16.4 4.2a2 2 0 0 1 2.9 0l.5.5a2 2 0 0 1 0 2.9L8.6 18.8 4 20Z" /><path d="M14 6.6 17.4 10" /></Icon>
);

export const EnlargeIcon = (p: Props) => (
  <Icon {...p}><path d="M14 4h6v6" /><path d="M10 20H4v-6" /><path d="M20 4l-7 7M4 20l7-7" /></Icon>
);

export const EyeIcon = (p: Props) => (
  <Icon {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>
);

export const LockIcon = (p: Props) => (
  <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="1" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></Icon>
);

export const SunIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
  </Icon>
);

export const MoonIcon = (p: Props) => <Icon {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" /></Icon>;

/** Filled, unlike the rest: a play triangle reads better solid. */
export const PlayIcon = ({ size = 10 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    <path d="M1.5 0.8 9 5 1.5 9.2Z" fill="currentColor" />
  </svg>
);
