'use client';

/**
 * DIG, drawn to hold a pose. The landing page's DigMascot walks a fixed loop
 * on its own; the demo needs DIG to react to the visitor instead, so this is
 * the same character (same shapes and colours) with a mood chosen from outside.
 *
 * `look` moves the pupils (−1 to 1 each way), so DIG can follow the pointer.
 */

export type DigMood =
  | 'idle' | 'wave' | 'point' | 'examine' | 'think' | 'cheer'
  | 'no' | 'sleep' | 'sip' | 'catch';

type Props = {
  mood: DigMood;
  size?: number;
  look?: { x: number; y: number };
};

const CREAM = '#fef3c7';
const OUTLINE = '#d4a85a';
const LEG = '#c8a060';
const GLASS = '#6366f1';
const EYE = '#1a1a2e';

// Each arm is a path from the shoulder and a hand at its end.
const LEFT_ARM: Partial<Record<DigMood, [string, number, number]>> = {
  cheer: ['M12 42 Q5 34 7 25', 7, 25],
  catch: ['M12 44 Q13 52 19 53', 19, 53],
};
const RIGHT_ARM: Partial<Record<DigMood, [string, number, number]>> = {
  wave: ['M36 38 Q45 32 44 21', 44, 21],
  point: ['M36 40 Q45 41 51 37', 51, 37],
  think: ['M36 41 Q41 36 31 32', 31, 32],
  cheer: ['M36 38 Q44 31 42 23', 42, 23],
  catch: ['M36 44 Q35 52 29 53', 29, 53],
  sip: ['M36 42 Q41 37 35 34', 35, 34],
};
const IDLE_LEFT: [string, number, number] = ['M12 42 Q7 48 11 54', 11.5, 54];
const IDLE_RIGHT: [string, number, number] = ['M36 38 Q43 42 42 50', 42, 50];

const MOUTH: Partial<Record<DigMood, string>> = {
  cheer: 'M19 29 Q24 35.5 29 29 Z',
  wave: 'M19 29 Q24 34 29 29 Z',
  no: 'M20 31.5 Q24 28.5 28 31.5',
  examine: 'M20 29 Q24 31 28 29',
  think: 'M21 30 Q24 30.5 27 29.5',
};
const SMILE = 'M19 29 Q24 32.5 29 29';
/** A four-pointed sparkle around 0,0. Drawn, because not every font has one. */
const SPARKLE = 'M0 -4 Q0.7 -0.7 4 0 Q0.7 0.7 0 4 Q-0.7 0.7 -4 0 Q-0.7 -0.7 0 -4 Z';

export default function DigFigure({ mood, size = 120, look = { x: 0, y: 0 } }: Props) {
  const [lPath, lx, ly] = LEFT_ARM[mood] ?? IDLE_LEFT;
  const [rPath, rx, ry] = RIGHT_ARM[mood] ?? IDLE_RIGHT;
  const asleep = mood === 'sleep';
  const examining = mood === 'examine';
  // Pupils follow `look`, except when DIG is busy looking at something else.
  const free = !asleep && !examining && mood !== 'think';
  const px = free ? Math.max(-1, Math.min(1, look.x)) * 1.5 : mood === 'think' ? 1 : 0;
  const py = free ? Math.max(-1, Math.min(1, look.y)) * 1.2 : mood === 'think' ? -1.4 : 0;
  const mouth = MOUTH[mood] ?? SMILE;
  const openMouth = mouth.endsWith('Z');

  return (
    <svg
      width={size * (54 / 80)}
      height={size}
      viewBox="-4 -10 62 92"
      fill="none"
      aria-hidden="true"
      className={'dg-dig dg-mood-' + mood}
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="25" cy="78" rx="13" ry="2.5" fill="rgba(0,0,0,0.16)" className="dg-shadow" />

      <g className="dg-body">
        <line x1="20" y1="60" x2="15" y2="70" stroke={LEG} strokeWidth="3.2" strokeLinecap="round" />
        <line x1="29" y1="60" x2="34" y2="70" stroke={LEG} strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="24.5" cy="46" rx="13.5" ry="15" fill={CREAM} stroke={OUTLINE} strokeWidth="1.5" />

        {/* A little data sheet, caught in both hands. */}
        {mood === 'catch' && (
          <g>
            <rect x="15" y="44" width="18" height="13" fill="#ffffff" stroke="#12121a" strokeWidth="1" />
            <rect x="15" y="44" width="18" height="3.4" fill="#d6f24a" stroke="#12121a" strokeWidth="1" />
            <line x1="17.5" y1="50" x2="30" y2="50" stroke="#12121a" strokeWidth="0.7" />
            <line x1="17.5" y1="53" x2="27" y2="53" stroke="#12121a" strokeWidth="0.7" />
          </g>
        )}

        <path d={lPath} stroke={OUTLINE} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx={lx} cy={ly} r="2.4" fill={CREAM} stroke={OUTLINE} strokeWidth="1.3" />

        <g className={mood === 'wave' ? 'dg-wave-arm' : undefined}>
          <path d={rPath} stroke={OUTLINE} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <circle cx={rx} cy={ry} r="2.4" fill={CREAM} stroke={OUTLINE} strokeWidth="1.3" />
        </g>

        {/* The magnifying glass, only while examining. */}
        {examining && (
          <g className="dg-glass">
            <circle cx="44" cy="57" r="6" fill="rgba(99,102,241,0.1)" stroke={GLASS} strokeWidth="1.8" />
            <rect x="41" y="55" width="1.8" height="3" fill={GLASS} opacity="0.7" />
            <rect x="43.3" y="53.5" width="1.8" height="4.5" fill="#818cf8" opacity="0.7" />
            <rect x="45.6" y="54.8" width="1.8" height="3.2" fill={GLASS} opacity="0.7" />
            <line x1="48.8" y1="61.5" x2="52" y2="65" stroke={GLASS} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        )}

        <g className="dg-head">
          <circle cx="10.5" cy="24" r="4.2" fill={CREAM} stroke={OUTLINE} strokeWidth="1.3" />
          <circle cx="38.5" cy="24" r="4.2" fill={CREAM} stroke={OUTLINE} strokeWidth="1.3" />
          <circle cx="24" cy="23" r="14.5" fill={CREAM} stroke={OUTLINE} strokeWidth="1.5" />

          {asleep ? (
            <g stroke={EYE} strokeWidth="1.3" strokeLinecap="round">
              <path d="M15.5 21.5 Q19 24 22.5 21.5" />
              <path d="M25.5 21.5 Q29 24 32.5 21.5" />
            </g>
          ) : (
            <g className="dg-eyes">
              <circle cx="19" cy="21" r="4.4" fill="#ffffff" />
              <circle cx="29" cy="21" r="4.4" fill="#ffffff" />
              <circle cx={19 + px} cy={21.5 + py} r="2.6" fill={EYE} />
              <circle cx={29 + px} cy={21.5 + py} r="2.6" fill={EYE} />
              <circle cx={20.2 + px} cy={20 + py} r="1.15" fill="#ffffff" />
              <circle cx={30.2 + px} cy={20 + py} r="1.15" fill="#ffffff" />
            </g>
          )}

          {examining && (
            <g stroke={EYE} strokeWidth="1.3" strokeLinecap="round">
              <line x1="15" y1="18.6" x2="23.5" y2="18.6" />
              <line x1="25" y1="18.6" x2="33.5" y2="18.6" />
            </g>
          )}

          <circle cx="13.5" cy="26" r="3.4" fill="#f9a8d4" opacity={mood === 'cheer' || mood === 'catch' ? 0.7 : 0.4} />
          <circle cx="34.5" cy="26" r="3.4" fill="#f9a8d4" opacity={mood === 'cheer' || mood === 'catch' ? 0.7 : 0.4} />

          <g stroke={GLASS} strokeWidth="1.45">
            <rect x="12.2" y="15.5" width="11" height="9.5" rx="4.8" fill="none" />
            <rect x="24.4" y="15.5" width="11" height="9.5" rx="4.8" fill="none" />
            <line x1="23.2" y1="20" x2="24.4" y2="20" />
            <line x1="12.2" y1="20" x2="9.2" y2="19.5" strokeWidth="1.2" />
            <line x1="35.4" y1="20" x2="38.4" y2="19.5" strokeWidth="1.2" />
          </g>

          {asleep ? (
            <circle cx="24" cy="30.5" r="1.4" fill="none" stroke={OUTLINE} strokeWidth="1.2" />
          ) : (
            <path
              d={mouth}
              fill={openMouth ? '#b45372' : 'none'}
              stroke={OUTLINE}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {examining && <path d="M38 14 Q39.5 10 38 7.5 Q36.5 10 38 14Z" fill="#93c5fd" opacity="0.8" />}
        </g>

        {/* A coffee, held to the mouth. Steam rises from it. */}
        {mood === 'sip' && (
          <g>
            <rect x="29" y="27.5" width="8" height="8.5" rx="1.2" fill="#ffffff" stroke="#12121a" strokeWidth="1" />
            <rect x="29" y="30" width="8" height="2.6" fill="#d6f24a" />
            <path d="M37 29.5 Q40 31.5 37 34" stroke="#12121a" strokeWidth="1" fill="none" />
            <path className="dg-steam" d="M31.5 25 Q30 22.5 31.5 20 Q33 17.5 31.5 15" stroke="#a8a29e" strokeWidth="0.9" fill="none" strokeLinecap="round" />
            <path className="dg-steam dg-steam-2" d="M34.5 25 Q33 22.5 34.5 20 Q36 17.5 34.5 15" stroke="#a8a29e" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          </g>
        )}
      </g>

      {mood === 'cheer' && (
        <g className="dg-sparkles">
          <path d={SPARKLE} transform="translate(2 5)" fill="#fbbf24" />
          <path d={SPARKLE} transform="translate(47 1.5) scale(.9)" fill="#f472b6" />
          <path d={SPARKLE} transform="translate(25 -6.5) scale(.75)" fill="#818cf8" />
        </g>
      )}
      {mood === 'think' && (
        <g className="dg-think">
          <circle cx="42" cy="6" r="1.3" fill="#a5b4fc" />
          <circle cx="46" cy="1" r="2" fill="#a5b4fc" />
          <text x="47" y="-3" fontSize="10" fontWeight="800" fill="#6366f1">?</text>
        </g>
      )}
      {asleep && (
        <g className="dg-zzz" fill="#818cf8" fontWeight="800">
          <text x="38" y="6" fontSize="7">z</text>
          <text x="43" y="-1" fontSize="9">z</text>
          <text x="49" y="-9" fontSize="11">Z</text>
        </g>
      )}
    </svg>
  );
}
