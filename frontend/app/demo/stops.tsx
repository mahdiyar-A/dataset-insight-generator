'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import sample from './sample.json';
import {
  CHECK, COLUMNS, EVIDENCE, FILE, FILES, PERSONAS, PLAN_FEATURES, PLANS,
} from './demoFacts';
import { useArrival, useTour } from './tour';

/**
 * The demo's stops. The first three walk the visitor through the basics in
 * order; after that a map opens everything up, to explore in any order.
 */
export const STOPS = [
  { key: 'upload', label: 'Upload', chapter: 'basics' },
  { key: 'check', label: 'Check', chapter: 'basics' },
  { key: 'clean', label: 'Clean', chapter: 'basics' },
  { key: 'explore', label: 'Explore', chapter: 'explore' },
  { key: 'what', label: 'What is it?', chapter: 'explore' },
  { key: 'report', label: 'Report', chapter: 'explore' },
  { key: 'ask', label: 'Ask', chapter: 'explore' },
  { key: 'plans', label: 'Free or Pro', chapter: 'explore' },
  { key: 'files', label: 'Take it home', chapter: 'explore' },
] as const;

export const BASICS = 3; // stops 0–2; the map is stop 3
export const BLANKS = CHECK.blanks.discount_pct + CHECK.blanks.satisfaction;

/** Basic terms DIG explains on the map, each with this file as the example. */
export const TERMS = [
  { id: 'row', term: 'Row', plain: 'One line of the file. Here, one product at one store on one day.' },
  { id: 'column', term: 'Column', plain: `One kind of information, like price or store. This file has ${FILE.columns}.` },
  { id: 'cleaning', term: 'Cleaning', plain: 'Fixing problems before any maths: repeated rows, blanks and impossible values.' },
  { id: 'correlation', term: 'Correlation', plain: 'How closely two things rise together, from −1 to 1. Price and revenue here: 0.71, strong.' },
  { id: 'pvalue', term: 'p-value', plain: 'How likely a pattern is just chance. Under 0.05 usually means it’s real.' },
  { id: 'trend', term: 'Trend', plain: 'A steady rise or fall over time. Revenue this year: flat, since p = 0.232.' },
];

export const TIP_COUNT = Object.keys(COLUMNS).length + 3 + EVIDENCE.length + TERMS.length;

const fmt = (n: number) => n.toLocaleString('en-US');

function StopHead({ stop, title, lead }: { stop: number; title: string; lead: ReactNode }) {
  const chapter = STOPS[stop].chapter === 'basics' ? `THE BASICS · ${stop + 1} OF ${BASICS}` : 'EXPLORE';
  return (
    <>
      <p className="dg-eyebrow">{chapter}</p>
      <h2 className="dg-h2">{title}</h2>
      <p className="dg-lead">{lead}</p>
    </>
  );
}

/** DIG's “press here”: a bouncing label under whatever wants pressing. */
function Coach({ label = 'Press here', above = false }: { label?: string; above?: boolean }) {
  return (
    <span className={above ? 'dg-coach above' : 'dg-coach'} aria-hidden="true">
      <span className="dg-coach-hand">👆</span> {label}
    </span>
  );
}

/** Keeps a timer's callback from speaking for a stop the visitor has left. */
function useActiveRef(active: boolean) {
  const ref = useRef(active);
  useEffect(() => {
    ref.current = active;
  });
  return ref;
}

function useTimers() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
}

// ── 1 Upload ──────────────────────────────────────────────────────────────────
export function UploadStop({ active }: { active: boolean }) {
  const tour = useTour();
  const activeRef = useActiveRef(active);
  const later = useTimers();
  const [status, setStatus] = useState<'none' | 'loading' | 'done'>('none');
  const [over, setOver] = useState(false);
  const [col, setCol] = useState<string | null>(null);
  const names = sample.file.headers;
  const opened = names.filter(n => tour.seen.has('col:' + n)).length;

  useArrival(0, () => status === 'done'
    ? { mood: 'point', say: `Click a column name to see what I read it as. ${opened} of ${names.length} opened.` }
    : { mood: 'wave', say: 'Let’s start! Drag the coffee shop’s file onto the box, or press Drop it in. 👉' });

  function start() {
    if (status !== 'none') return;
    setStatus('loading');
    tour.say({ mood: 'catch', say: 'Catching it… reading every row! 📥' });
    later(() => {
      setStatus('done');
      tour.done(`File read: ${fmt(FILE.rows)} rows and ${FILE.columns} columns.`);
      if (activeRef.current) tour.say({ mood: 'point', say: 'Got it! Now press a column name to see what I read it as.' });
    }, 1300);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer?.files?.length) {
      tour.say({
        mood: 'no',
        say: 'Ooh, your own file! Here I only know the coffee shop’s, and yours stays on your computer. Make a free account and I’ll read it properly.',
      });
      return;
    }
    start();
  }

  function openColumn(name: string) {
    setCol(c => (c === name ? null : name));
    const id = 'col:' + name;
    const isNew = !tour.seen.has(id);
    const after = names.filter(n => n === name || tour.seen.has('col:' + n)).length;
    tour.seeTip(id);
    const info = COLUMNS[name];
    if (isNew && after === names.length) {
      tour.done('You checked every column. You read data like I do! 🧐');
      tour.say({ mood: 'cheer', say: 'Every column checked! Press Next and I’ll check the file for problems.' });
    } else if (info) {
      tour.say({ mood: 'point', say: `${name}: I read that as ${info.kind.toLowerCase()}.` });
    }
  }

  return (
    <div>
      <StopHead stop={0} title="Drop in a file" lead={sample.steps.upload} />

      {status !== 'done' ? (
        <div className="dg-upload">
          <button
            type="button"
            className={'dg-file' + (status === 'loading' ? ' gone' : '')}
            draggable={status === 'none'}
            onDragStart={e => e.dataTransfer.setData('text/plain', sample.file.name)}
            onClick={start}
            aria-label={`Use ${sample.file.name}`}
          >
            <span className="dg-sheet" aria-hidden="true" />
            <strong>{sample.file.name}</strong>
            <small>{fmt(FILE.rows)} rows · a year of sales from a made-up coffee chain</small>
          </button>

          <div
            className={'dg-drop' + (over ? ' over' : '')}
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {status === 'loading' ? (
              <>
                <p><strong>Reading {sample.file.name}…</strong></p>
                <div className="dg-progress" role="progressbar" aria-label="Reading the file"><span /></div>
              </>
            ) : (
              <>
                <p className="dg-drop-title">Drag the file here</p>
                <p>or</p>
                <span className="dg-coach-wrap">
                  <button type="button" className="dg-btn lime dg-ring" onClick={start}>Drop it in</button>
                  <Coach />
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="dg-stage-in">
          <div className="dg-facts">
            <span className="dg-fact">✓ {sample.file.name}</span>
            <span className="dg-fact">{fmt(FILE.rows)} rows</span>
            <span className="dg-fact">{FILE.columns} columns</span>
            <span className="dg-fact">{FILE.firstDate} to {FILE.lastDate}</span>
          </div>
          <div className="dg-coach-wrap dg-block">
            <div className="dg-tablewrap">
              <table className="dg-table">
                <caption className="dg-sr">The first five rows of {sample.file.name}. Press a column name to see what DIG read it as.</caption>
                <thead>
                  <tr>
                    {names.map(h => (
                      <th key={h} scope="col" className={col === h ? 'on' : undefined}>
                        <button type="button" aria-expanded={col === h} onClick={() => openColumn(h)}>
                          <span className={'dg-hot' + (tour.seen.has('col:' + h) ? ' seen' : '')} aria-hidden="true" />
                          {h}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.file.preview.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className={col === names[c] ? 'on' : undefined}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {opened === 0 && <Coach label="Press a column name" />}
          </div>
          {col && COLUMNS[col] && (
            <div className="dg-note" role="note">
              <span className="dg-kind">{COLUMNS[col].kind}</span>
              <span><strong>{col}</strong>: {COLUMNS[col].note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 2 Check ───────────────────────────────────────────────────────────────────
const CHECK_CARDS = [
  {
    big: CHECK.repeatedRows, label: 'repeated rows', sub: 'The same sale, written twice',
    back: 'Cleaning keeps one copy of each, so no sale is counted twice.',
  },
  {
    big: BLANKS, label: 'blank cells', sub: `discount_pct ${CHECK.blanks.discount_pct} · satisfaction ${CHECK.blanks.satisfaction}`,
    back: 'Cleaning fills each blank in, so no row has to be thrown away.',
  },
  {
    big: CHECK.belowZero, label: 'impossible values', sub: 'units_sold below zero',
    back: 'You can’t sell fewer than zero coffees. Cleaning pulls values like these back into a sensible range.',
  },
];
// Where the illustration flags a row: repeated, blank or below zero.
const SCAN_ROWS = 16;
const SCAN_FLAGS: Record<number, string> = { 2: 'dup', 4: 'blank', 6: 'neg', 9: 'dup', 11: 'blank', 13: 'dup', 14: 'neg' };

export function CheckStop() {
  const tour = useTour();
  const [flipped, setFlipped] = useState<number[]>([]);

  useArrival(1, () => flipped.length === CHECK_CARDS.length
    ? { mood: 'cheer', say: 'All three checked. Press Next: you decide what I do about them.' }
    : { mood: 'examine', say: 'Before any maths, I check the file. I found three kinds of problems. Press a card to flip it!' });

  function flip(i: number) {
    const opening = !flipped.includes(i);
    setFlipped(f => (f.includes(i) ? f.filter(x => x !== i) : [...f, i]));
    const isNew = !tour.seen.has('check:' + i);
    const after = CHECK_CARDS.filter((_, j) => j === i || tour.seen.has('check:' + j)).length;
    tour.seeTip('check:' + i);
    if (isNew && after === CHECK_CARDS.length) {
      tour.done('Three problems found before a single sum. That’s how reports stay honest.');
      tour.say({ mood: 'cheer', say: 'You found them all! Press Next: you decide on cleaning.' });
    } else if (opening) {
      tour.say({ mood: 'examine', say: CHECK_CARDS[i].back });
    }
  }

  return (
    <div>
      <StopHead stop={1} title="DIG checks it first" lead="Repeated rows, blanks and impossible values are found before any statistics run." />
      <div className="dg-scan" aria-hidden="true">
        {Array.from({ length: SCAN_ROWS }, (_, i) => (
          <i key={i} className={SCAN_FLAGS[i] ? 'flag-' + SCAN_FLAGS[i] : undefined} style={{ '--d': `${(i / SCAN_ROWS) * 1.5}s` } as CSSProperties} />
        ))}
      </div>
      <p className="dg-legend">
        <span style={{ '--c': 'var(--warn)' } as CSSProperties}>Repeated</span>
        <span style={{ '--c': 'var(--cobalt-accent)' } as CSSProperties}>Blank</span>
        <span style={{ '--c': 'var(--danger)' } as CSSProperties}>Below zero</span>
        <span className="dg-faint">A picture of the scan. The counts below are the file’s real ones.</span>
      </p>
      <div className="dg-flips">
        {CHECK_CARDS.map((card, i) => {
          const on = flipped.includes(i);
          return (
            <button
              key={i}
              type="button"
              className="dg-flip"
              aria-pressed={on}
              onClick={() => flip(i)}
              style={{ '--d': `${1.6 + i * 0.15}s` } as CSSProperties}
            >
              <span className="dg-flip-in">
                <span className="dg-face" aria-hidden={on}>
                  <span className="dg-big">{card.big}</span>
                  <strong>{card.label}</strong>
                  <span className="dg-faint">{card.sub}</span>
                  <small>Flip: what DIG does ↻</small>
                </span>
                <span className="dg-face back" aria-hidden={!on}>
                  <strong>What DIG does</strong>
                  <span>{card.back}</span>
                  <small>Flip back ↻</small>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 3 Clean ───────────────────────────────────────────────────────────────────
export function CleanStop() {
  const tour = useTour();
  const [choice, setChoice] = useState<null | 'clean' | 'keep'>(null);

  useArrival(2, () => choice === 'clean'
    ? { mood: 'cheer', say: 'Clean file, ready for the report. Press Next and the whole demo opens up!' }
    : choice === 'keep'
      ? { mood: 'idle', say: 'Your file, your call. Want to see the cleaned one anyway?' }
      : { mood: 'think', say: 'I never change your file without asking. Should I clean it? 👉' });

  function clean() {
    setChoice('clean');
    tour.done(`Cleaned! ${CHECK.repeatedRows} repeats removed, ${BLANKS} blanks filled, ${CHECK.belowZero} impossible values fixed.`);
    tour.say({ mood: 'cheer', say: 'Squeaky clean! ✨ That’s the basics done. Press Next and explore anything you like.' });
  }

  function keep() {
    setChoice('keep');
    tour.say({ mood: 'idle', say: 'Your file, your call. I’d write the report from it just as it is. Want to see the cleaned one anyway?' });
  }

  return (
    <div>
      <StopHead stop={2} title="You decide on cleaning" lead={sample.steps.clean} />
      <div className="dg-card">
        {choice !== 'clean' ? (
          <>
            <p className="dg-q">Clean the file before the report?</p>
            <ul className="dg-list">
              <li>Remove the {CHECK.repeatedRows} repeated rows</li>
              <li>Fill in the {BLANKS} blank cells</li>
              <li>Pull the {CHECK.belowZero} impossible values back into range</li>
            </ul>
            <div className="dg-row">
              <span className="dg-coach-wrap">
                <button type="button" className={'dg-btn lime' + (choice ? '' : ' dg-ring')} onClick={clean}>
                  {choice === 'keep' ? 'Show me the cleaned one' : 'Clean it'}
                </button>
                {!choice && <Coach />}
              </span>
              {!choice && <button type="button" className="dg-btn ghost" onClick={keep}>Keep it as it is</button>}
            </div>
            {choice === 'keep' && (
              <p className="dg-faint dg-gap">Kept as it is. In your account, the report would use the file unchanged.</p>
            )}
          </>
        ) : (
          <>
            <p className="dg-q">Cleaned. Here’s what changed:</p>
            <div className="dg-stats">
              <div className="dg-stat"><span>Rows</span><s>{fmt(FILE.rows)}</s><strong style={{ '--d': '0s' } as CSSProperties}>{fmt(FILE.cleanRows)}</strong></div>
              <div className="dg-stat"><span>Blank cells</span><s>{BLANKS}</s><strong style={{ '--d': '.12s' } as CSSProperties}>0</strong></div>
              <div className="dg-stat"><span>Below zero</span><s>{CHECK.belowZero}</s><strong style={{ '--d': '.24s' } as CSSProperties}>0</strong></div>
            </div>
            <a className="dg-btn" href="/demo/cleaned_coffee_sales.csv" download>Download the cleaned file (CSV)</a>
          </>
        )}
      </div>
    </div>
  );
}

// ── Map: explore in any order ─────────────────────────────────────────────────
const AREAS = [
  { stop: 4, emoji: '🔎', title: 'What is it?', teaser: 'DIG asks what the data is. Then see how Pro lets you steer the report.' },
  { stop: 5, emoji: '📄', title: 'The report', teaser: '5 findings and 5 charts. Click any number to see where it comes from, then edit it.' },
  { stop: 6, emoji: '💬', title: 'Ask DIG', teaser: 'Ask about the report. DIG answers from the file and says no to the rest.' },
  { stop: 7, emoji: '⚖️', title: 'Free or Pro', teaser: 'Flip between the plans and watch what unlocks.' },
  { stop: 8, emoji: '📦', title: 'Take it home', teaser: 'The report as PDF, Word or PowerPoint, and the cleaned data.' },
];

export function ExploreStop({ visited }: { visited: ReadonlySet<number> }) {
  const tour = useTour();
  const [term, setTerm] = useState<string | null>(null);
  const persona = PERSONAS.find(p => p.id === tour.persona);

  useArrival(3, () => ({
    mood: 'cheer',
    say: 'You’ve got the basics! Everything is open now: pick any card, in any order. I’ll tag along. 🗺️',
  }));

  function openTerm(id: string) {
    setTerm(t => (t === id ? null : id));
    tour.seeTip('term:' + id);
    const found = TERMS.find(t => t.id === id);
    if (found) tour.say({ mood: 'point', say: `${found.term}: ${found.plain}` });
  }

  return (
    <div>
      <StopHead
        stop={3}
        title="You know the basics. Now explore."
        lead={<>Pick anything, in any order. {persona ? persona.line : 'Every stop is something DIG really does with your file.'}</>}
      />
      <div className="dg-map">
        {AREAS.map((a, i) => (
          <button
            key={a.stop}
            type="button"
            className={'dg-area' + (visited.has(a.stop) ? ' seen' : '')}
            onClick={() => tour.go(a.stop)}
            style={{ '--d': `${i * 0.07}s` } as CSSProperties}
          >
            <span className="dg-area-emoji" aria-hidden="true">{a.emoji}</span>
            <strong>{a.title}</strong>
            <span>{a.teaser}</span>
            <small>{visited.has(a.stop) ? 'Visited ✓' : 'Go →'}</small>
          </button>
        ))}
      </div>

      <h3 className="dg-h3">DIG’s dictionary</h3>
      <p className="dg-faint dg-tight">Six words that make any report easier to read. Press one.</p>
      <div className="dg-terms">
        {TERMS.map(t => (
          <button
            key={t.id}
            type="button"
            className={'dg-term' + (tour.seen.has('term:' + t.id) ? ' seen' : '')}
            aria-expanded={term === t.id}
            onClick={() => openTerm(t.id)}
          >
            {t.term}
          </button>
        ))}
      </div>
      {term && (
        <div className="dg-note" role="note">
          <span className="dg-kind">{TERMS.find(t => t.id === term)?.term}</span>
          <span>{TERMS.find(t => t.id === term)?.plain}</span>
        </div>
      )}
    </div>
  );
}

// ── What is it ────────────────────────────────────────────────────────────────
const GUESSES = [
  { id: 'coffee', emoji: '☕', label: 'Sales from a coffee chain', reply: '' },
  { id: 'clinic', emoji: '🩺', label: 'Patient visits at a clinic', reply: 'Hmm, clinics don’t usually sell croissants. Try again! 🥐' },
  { id: 'football', emoji: '⚽', label: 'Football match scores', reply: 'I see lattes, not goals. One more try!' },
  { id: 'weather', emoji: '🌦️', label: 'Weather readings', reply: 'Not a single temperature in sight. Guess again!' },
];
const TONES = ['Professional', 'Technical / statistical', 'Storytelling / narrative', 'Casual / friendly', 'Academic / research', 'Simplified / plain language'];
const DEPTHS = ['Quick', 'Standard', 'Deep dive'];

export function WhatStop() {
  const tour = useTour();
  const [wrong, setWrong] = useState<string[]>([]);
  const [ok, setOk] = useState(false);
  const [tone, setTone] = useState<string | null>(null);
  const [depth, setDepth] = useState<string | null>(null);

  useArrival(4, () => ok
    ? { mood: 'cheer', say: 'Coffee chain it is! Now see how Pro lets you steer the report.' }
    : { mood: 'think', say: 'I always check what the data is about, so the report talks about the right things. What do you think this file is?' });

  function guess(id: string) {
    const g = GUESSES.find(x => x.id === id);
    if (!g || ok || wrong.includes(id)) return;
    if (id === 'coffee') {
      setOk(true);
      tour.done('Same as me! I’ll write about stores, products and revenue.');
      tour.say({ mood: 'cheer', say: wrong.length ? 'Got there! Coffee chain it is.' : 'First try! You think like a data scientist. ☕' });
    } else {
      setWrong(w => [...w, id]);
      tour.say({ mood: 'no', say: g.reply });
    }
  }

  function pick(kind: 'tone' | 'depth', value: string) {
    if (tour.plan !== 'pro') return;
    if (kind === 'tone') setTone(value); else setDepth(value);
    tour.say({ mood: 'point', say: `${value}! In your account I’d write the next report that way. This sample stays as it is.` });
  }

  return (
    <div>
      <StopHead stop={4} title="DIG asks what it is" lead="A sales file and a clinic file need different reports, so DIG asks what it is looking at first." />
      <div className="dg-card">
        <p className="dg-q">What is this file?</p>
        <div className="dg-options">
          {GUESSES.map(g => (
            <button
              key={g.id}
              type="button"
              className={'dg-option' + (wrong.includes(g.id) ? ' wrong' : '') + (ok && g.id === 'coffee' ? ' right' : '')}
              disabled={wrong.includes(g.id) || (ok && g.id !== 'coffee')}
              onClick={() => guess(g.id)}
            >
              <span className="dg-emoji" aria-hidden="true">{g.emoji}</span>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {ok && (
        <div className="dg-focus">
          <p className="dg-eyebrow">THE FOCUS FOR THIS REPORT</p>
          <p className="dg-quote">“{sample.focus}”</p>
          {tour.plan === 'free' ? (
            <div className="dg-locked">
              <span className="dg-pro-tag">PRO</span>
              <span>On Pro you steer the report yourself: its focus, assumptions, your own questions, language and tone. Or describe it in your own words.</span>
              <button type="button" className="dg-btn lime small" onClick={() => tour.setPlan('pro')}>See it on Pro</button>
            </div>
          ) : (
            <div className="dg-steer">
              <p className="dg-faint-light">On Pro you set these before the run. Try a few:</p>
              <p className="dg-steer-label">Tone</p>
              <div className="dg-pills">
                {TONES.map(t => (
                  <button key={t} type="button" aria-pressed={tone === t} onClick={() => pick('tone', t)}>{t}</button>
                ))}
              </div>
              <p className="dg-steer-label">Depth</p>
              <div className="dg-pills">
                {DEPTHS.map(d => (
                  <button key={d} type="button" aria-pressed={depth === d} onClick={() => pick('depth', d)}>{d}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── The report ────────────────────────────────────────────────────────────────
const INSIGHTS = sample.report.insights;
const EVIDENCE_RE = new RegExp('(' + EVIDENCE.map(e => e.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');

export function ReportStop({ active }: { active: boolean }) {
  const tour = useTour();
  const activeRef = useActiveRef(active);
  const later = useTimers();
  const draft = tour.drafts[tour.drafts.length - 1];
  const version = tour.drafts.length;
  const [ev, setEv] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [zoom, setZoom] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [sam, setSam] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const zoomFrom = useRef<HTMLButtonElement | null>(null);

  useArrival(5, () => ({
    mood: 'sip',
    say: 'Here’s the report. Press an underlined number to see where it comes from. You can edit it too: rename, move or hide a finding.',
  }));

  useEffect(() => {
    if (zoom === null) {
      zoomFrom.current?.focus();
      zoomFrom.current = null;
      return;
    }
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  function openEvidence(text: string) {
    setEv(e => (e === text ? null : text));
    tour.seeTip('ev:' + text);
    tour.say({ mood: 'point', say: 'Every number in a DIG report comes from the statistics. That one, in plain words, is just below.' });
  }

  function move(pos: number, by: -1 | 1) {
    const idx = draft.order[pos];
    tour.commit(d => {
      const order = [...d.order];
      const at = order.indexOf(idx);
      const to = at + by;
      if (at < 0 || to < 0 || to >= order.length) return d;
      [order[at], order[to]] = [order[to], order[at]];
      return { ...d, order };
    }, by < 0 ? 'Moved up.' : 'Moved down.');
    setFlash(idx);
  }

  function hide(idx: number) {
    tour.commit(d => ({ ...d, order: d.order.filter(i => i !== idx), hidden: [...d.hidden, idx] }), 'Hidden from the report.');
  }

  function show(idx: number) {
    tour.commit(d => ({ ...d, hidden: d.hidden.filter(i => i !== idx), order: [...d.order, idx] }), 'Back in the report, at the end.');
    setFlash(idx);
  }

  function saveTitle() {
    const next = title.trim();
    setEditing(false);
    if (next && next !== draft.title) tour.commit(d => ({ ...d, title: next }), 'Renamed.');
  }

  function watchTeammate() {
    if (sam) return;
    setSam(true);
    tour.say({ mood: 'point', say: 'Look! Sam, a teammate, is editing the same report right now…' });
    later(() => {
      let movedIdx = -1;
      tour.commit(d => {
        if (d.order.length < 2) return d;
        const at = Math.min(3, d.order.length - 1);
        const order = [...d.order];
        [order[at - 1], order[at]] = [order[at], order[at - 1]];
        movedIdx = order[at - 1];
        return { ...d, order };
      }, 'Sam moved a finding up. Your page updated live.', 'Sam');
      setSam(false);
      if (movedIdx >= 0) setFlash(movedIdx);
      if (activeRef.current) tour.say({ mood: 'cheer', say: 'Saved together, no refresh needed. That’s Pro teams: up to 5 people on one report.' });
    }, 1900);
  }

  const visible = draft.order;
  const notes = draft.notes;

  return (
    <div>
      <StopHead stop={5} title="The report" lead={sample.steps.report} />

      <div className="dg-toolbar">
        <span className="dg-version">Version {version}</span>
        <span className="dg-saved">✓ Saved{draft.by === 'Sam' ? ' by Sam' : ''}</span>
        <button type="button" className="dg-btn ghost small" disabled={version === 1} onClick={tour.undo}>↶ Undo</button>
        <span className="dg-team">
          {tour.plan === 'pro' ? (
            <>
              <span className="dg-avatar you" title="You">You</span>
              <span className={'dg-avatar sam' + (sam || draft.by === 'Sam' ? ' live' : '')} title="Sam, an example teammate">S</span>
              <button type="button" className="dg-btn small cobalt" onClick={watchTeammate} disabled={sam}>
                {sam ? 'Sam is editing…' : 'Watch a teammate edit'}
              </button>
            </>
          ) : (
            <>
              <span className="dg-pro-tag">PRO</span>
              <span className="dg-faint">Edit together, live</span>
              <button type="button" className="dg-btn ghost small" onClick={() => tour.setPlan('pro')}>See it on Pro</button>
            </>
          )}
        </span>
      </div>

      <div className={'dg-card dg-report' + (sam ? ' dg-sam-on' : '')}>
        {sam && (
          <span className="dg-cursor" aria-hidden="true">
            <svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1 L1 17 L5.5 13 L9 21 L12 19.5 L8.6 12 L15 12 Z" fill="#d6f24a" stroke="#12121a" strokeWidth="1.5" /></svg>
            <span>Sam · example teammate</span>
          </span>
        )}

        <div className="dg-titlerow">
          {editing ? (
            <input
              className="dg-titleinput"
              aria-label="Report title"
              value={title}
              autoFocus
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <h3 className="dg-rtitle">{draft.title}</h3>
          )}
          {!editing && (
            <button type="button" className="dg-btn ghost small" onClick={() => { setTitle(draft.title); setEditing(true); }}>
              ✎ Rename
            </button>
          )}
        </div>

        <p className="dg-summary">
          {sample.report.summary.split(EVIDENCE_RE).map((part, i) => {
            const hit = EVIDENCE.find(e => e.text === part);
            return hit ? (
              <button key={i} type="button" className="dg-ev" aria-expanded={ev === part} onClick={() => openEvidence(part)}>
                {part}
              </button>
            ) : (
              <span key={i}>{part}</span>
            );
          })}
        </p>
        {ev && (
          <div className="dg-note" role="note">
            <span className="dg-kind">{ev}</span>
            <span>{EVIDENCE.find(e => e.text === ev)?.plain}</span>
          </div>
        )}

        {notes.length > 0 && (
          <div className="dg-notes">
            <p className="dg-eyebrow">FROM YOUR QUESTIONS</p>
            {notes.map(n => (
              <div key={n} className="dg-qnote">
                <strong>{sample.answers[n].q}</strong>
                <span>{sample.answers[n].a}</span>
                <button type="button" className="dg-btn ghost small" onClick={() => tour.commit(d => ({ ...d, notes: d.notes.filter(x => x !== n) }), 'Note removed.')}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {visible.map((idx, pos) => {
          const ins = INSIGHTS[idx];
          return (
            <article key={idx} className={'dg-insight' + (flash === idx ? ' flash' : '')} onAnimationEnd={() => setFlash(f => (f === idx ? null : f))}>
              <div>
                <span className="dg-rank">{String(pos + 1).padStart(2, '0')}</span>
                <h4>{ins.title}</h4>
                <p>{ins.body}</p>
                <div className="dg-ctrls">
                  <button type="button" className="dg-btn ghost small" disabled={pos === 0} aria-label={`Move up: ${ins.title}`} onClick={() => move(pos, -1)}>↑ Up</button>
                  <button type="button" className="dg-btn ghost small" disabled={pos === visible.length - 1} aria-label={`Move down: ${ins.title}`} onClick={() => move(pos, 1)}>↓ Down</button>
                  <button type="button" className="dg-btn ghost small" aria-label={`Hide: ${ins.title}`} onClick={() => hide(idx)}>Hide</button>
                </div>
              </div>
              <div>
                <button type="button" className="dg-chart" onClick={(e) => { zoomFrom.current = e.currentTarget; setZoom(idx); }} aria-label={`Enlarge the chart: ${ins.chart.label}`}>
                  <Image src={ins.chart.src} alt={ins.chart.label} width={1184} height={659} sizes="(max-width: 860px) 100vw, 420px" />
                  <span className="dg-zoomtag">⤢ Enlarge</span>
                </button>
                <p className="dg-caption">{ins.chart.desc}</p>
              </div>
            </article>
          );
        })}

        {draft.hidden.length > 0 && (
          <div className="dg-hidden">
            <span>Hidden:</span>
            {draft.hidden.map(idx => (
              <button key={idx} type="button" className="dg-btn ghost small" onClick={() => show(idx)} aria-label={`Show again: ${INSIGHTS[idx].title}`}>
                ＋ {INSIGHTS[idx].title}
              </button>
            ))}
          </div>
        )}

        <div className="dg-conclusion">
          <p className="dg-eyebrow">CONCLUSION</p>
          <p>{sample.report.conclusion}</p>
        </div>
      </div>

      {zoom !== null && (
        <div className="dg-lightbox" role="dialog" aria-modal="true" aria-label={INSIGHTS[zoom].chart.label} onClick={() => setZoom(null)}>
          <figure onClick={e => e.stopPropagation()}>
            <Image src={INSIGHTS[zoom].chart.src} alt={INSIGHTS[zoom].chart.label} width={1184} height={659} sizes="(max-width: 1040px) 100vw, 1040px" />
            <figcaption>
              <span>
                <strong>{INSIGHTS[zoom].chart.label}</strong>
                {INSIGHTS[zoom].chart.desc}
              </span>
              <button ref={closeRef} type="button" className="dg-btn small" onClick={() => setZoom(null)}>Close</button>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

// ── Ask ───────────────────────────────────────────────────────────────────────
type Msg = { from: 'you' | 'dig'; text: string; source?: string; i?: number };

const SOURCE: Record<string, string> = {
  data: 'Looked up in the file',
  analysis: 'From the analysis',
  refused: 'Outside the data · declined',
};

export function AskStop({ active }: { active: boolean }) {
  const tour = useTour();
  const activeRef = useActiveRef(active);
  const later = useTimers();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const askedSet = new Set(msgs.filter(m => m.from === 'you').map(m => m.i));
  const limit = PLANS[tour.plan].questions;
  const notes = tour.drafts[tour.drafts.length - 1].notes;

  useArrival(6, () => ({
    mood: 'point',
    say: 'Ask me about the report! I answer from the file itself, and I say no to anything outside it. Press a question. 👇',
  }));

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [msgs.length, typing]);

  function ask(i: number) {
    if (typing || askedSet.has(i)) return;
    const item = sample.answers[i];
    setMsgs(m => [...m, { from: 'you', text: item.q, i }]);
    setTyping(true);
    tour.say({ mood: 'think', say: 'Let me look that up… 🔍' });
    later(() => {
      setTyping(false);
      setMsgs(m => [...m, { from: 'dig', text: item.a, source: item.source, i }]);
      if (!activeRef.current) return;
      if (item.source === 'refused') {
        tour.say({ mood: 'no', say: 'That one’s outside the file, so I politely decline. I stay on your data. 🙅' });
      } else if (askedSet.size + 1 === sample.answers.length) {
        tour.done('You asked them all! Every answer came from the file or the analysis.');
        tour.say({ mood: 'cheer', say: 'All five! You can add any answer to the report, too.' });
      } else {
        tour.say({ mood: 'cheer', say: item.source === 'data' ? 'I looked that up in the file itself. Want it in the report? Press Add to report.' : 'That comes from the analysis behind the report.' });
      }
    }, 850);
  }

  function addToReport(i: number) {
    tour.commit(d => (d.notes.includes(i) ? d : { ...d, notes: [...d.notes, i] }), 'Added to the report.');
  }

  return (
    <div>
      <StopHead stop={6} title="Ask about it" lead="Questions stay on your data, and figures are checked against your file." />
      <div className="dg-chat">
        <div className="dg-msgs" ref={boxRef} role="log" aria-label="Chat with DIG" aria-live="polite">
          <div className="dg-msg dig">Hi! Ask me anything about this report. Pick a question below. 👇</div>
          {msgs.map((m, k) => {
            const i = m.i;
            return (
              <div key={k} className={'dg-msg ' + m.from}>
                {m.text}
                {m.from === 'dig' && m.source && (
                  <span className="dg-msg-foot">
                    <span className={'dg-src ' + m.source}>{SOURCE[m.source]}</span>
                    {m.source !== 'refused' && i !== undefined && (
                      notes.includes(i)
                        ? <span className="dg-added">✓ In the report</span>
                        : <button type="button" className="dg-btn ghost small" onClick={() => addToReport(i)}>＋ Add to report</button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {typing && (
            <div className="dg-msg dig dg-typing" aria-label="DIG is typing"><i /><i /><i /></div>
          )}
        </div>
        <div className="dg-chips">
          {sample.answers.map((a, i) => (
            <span key={i} className="dg-coach-wrap">
              <button type="button" className="dg-chip" disabled={askedSet.has(i) || typing} onClick={() => ask(i)}>
                {a.q}
              </button>
              {i === 0 && msgs.length === 0 && <Coach above />}
            </span>
          ))}
        </div>
        <div className="dg-type">
          <input
            readOnly
            aria-label="Type your own question"
            placeholder="Type your own question…"
            onFocus={() => tour.say({ mood: 'point', say: `Here I only know these five. With an account, ask anything about your own data: ${PLANS.free.questions} questions a day on Free, ${PLANS.pro.questions} on Pro.` })}
          />
          <span className="dg-quota">{Math.max(0, limit - askedSet.size)} of {limit} left today on {PLANS[tour.plan].name}</span>
        </div>
      </div>
    </div>
  );
}

// ── Free or Pro ───────────────────────────────────────────────────────────────
export function PlansStop() {
  const tour = useTour();
  const p = PLANS[tour.plan];
  const pro = tour.plan === 'pro';

  useArrival(7, () => ({
    mood: 'point',
    say: 'Free gets you a full report. Pro adds more room, more formats and teammates. Flip the switch and watch what unlocks! 🔓',
  }));

  return (
    <div>
      <StopHead stop={7} title="Free or Pro?" lead="Start free. Upgrade when you need more analyses, Word and PowerPoint, or a team." />
      <div className="dg-switch" role="group" aria-label="Plan">
        <button type="button" aria-pressed={!pro} onClick={() => tour.setPlan('free')}>Free</button>
        <button type="button" aria-pressed={pro} onClick={() => tour.setPlan('pro')}>Pro</button>
        <span className="dg-switch-knob" style={{ transform: pro ? 'translateX(100%)' : 'none' }} aria-hidden="true" />
      </div>

      <div className={'dg-plancard' + (pro ? ' pro' : '')}>
        <div className="dg-price">
          <strong key={p.price}>{p.price}</strong>
          <span>{p.per}</span>
        </div>
        <div className="dg-meters">
          {[
            { label: 'Analyses', value: p.analyses, width: pro ? 100 : 12 },
            { label: 'Analyses kept', value: String(p.kept), width: (p.kept / PLANS.pro.kept) * 100 },
            { label: 'Questions a day', value: String(p.questions), width: (p.questions / PLANS.pro.questions) * 100 },
          ].map(m => (
            <div key={m.label} className="dg-pmeter">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <span className="dg-pmeter-track"><span style={{ width: `${m.width}%` }} /></span>
            </div>
          ))}
        </div>
        <ul className="dg-features">
          {PLAN_FEATURES.map(f => {
            const has = !f.pro || pro;
            return (
              <li key={f.name} className={has ? 'has' : 'no'}>
                <span className="dg-mark" aria-hidden="true">{has ? '✓' : '🔒'}</span>
                <span>
                  {f.name}
                  {f.note && <small> · {f.note}</small>}
                  <span className="dg-sr">{has ? ' (included)' : ' (Pro only)'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="dg-row">
          <Link href="/register" className="dg-btn lime">Start free</Link>
          <Link href="/plans" className="dg-btn ghost">See the plans</Link>
        </div>
      </div>
    </div>
  );
}

// ── Take it home ──────────────────────────────────────────────────────────────
const CTA_LINE: Record<string, string> = {
  business: 'Drop in your own sales and see what sells, where.',
  study: 'Drop in your own data and get every statistic explained.',
  data: 'Drop in your own file and get a checked, written report.',
  curious: 'Drop in any spreadsheet and see what story it tells.',
};

export function FilesStop() {
  const tour = useTour();
  const pro = tour.plan === 'pro';
  const tipsLeft = TIP_COUNT - tour.seen.size;

  useArrival(8, () => ({
    mood: 'cheer',
    say: 'That’s the tour! 🎉 Take the files home, or make a free account and I’ll read your own data.',
  }));

  function took(name: string) {
    tour.burst();
    tour.say({ mood: 'cheer', say: `Enjoy the ${name}! 📄` });
  }

  return (
    <div>
      <StopHead stop={8} title="Take it home" lead="The report as PDF, Word or PowerPoint, plus the cleaned data. These are the real files from this run." />
      <div className="dg-files">
        {FILES.map(f => (
          <a key={f.href} className="dg-filecard" href={f.href} download onClick={() => took(f.ext.toUpperCase())}>
            <span className={'dg-ext ' + f.ext} aria-hidden="true">{f.ext.toUpperCase()}</span>
            <strong>{f.name} ({f.ext.toUpperCase()})</strong>
            <small>{f.size}</small>
            <span className={'dg-plan' + (f.pro && !pro ? ' locked' : '')}>
              {f.pro ? (pro ? 'Included on Pro' : '🔒 Pro · sample to try') : 'Free and Pro'}
            </span>
          </a>
        ))}
      </div>

      <div className="dg-recap">
        <p className="dg-eyebrow">IN THIS TOUR, DIG</p>
        <ul>
          <li><strong>read {fmt(FILE.rows)} rows</strong> and told you what each column holds</li>
          <li><strong>caught {CHECK.repeatedRows} repeats, {BLANKS} blanks and {CHECK.belowZero} impossible values</strong> before any maths</li>
          <li><strong>wrote {INSIGHTS.length} findings and {INSIGHTS.length} charts</strong>, every figure from the statistics</li>
          <li><strong>answers questions</strong> from the file itself, and says no to the ones that aren’t about it</li>
        </ul>
        <p className="dg-faint">
          {tipsLeft > 0 ? `You opened ${tour.seen.size} of ${TIP_COUNT} tips. ${tipsLeft} still hiding around the demo!` : `You opened all ${TIP_COUNT} tips. Data detective! 🕵️`}
        </p>
      </div>

      <div className="dg-cta">
        <div>
          <h3>Your turn.</h3>
          <p>{CTA_LINE[tour.persona ?? 'curious']} Free, no card needed.</p>
        </div>
        <div className="dg-row">
          <Link href="/register" className="dg-btn lime">Create a free account</Link>
          <Link href="/" className="dg-btn ghost">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
