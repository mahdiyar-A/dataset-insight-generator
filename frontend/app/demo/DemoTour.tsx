'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';

import { DARK_BRIGHTNESS, LIGHT_ABOVE, LIGHT_BRIGHTNESS, useSettings } from '@/app/contexts/SettingsContext';
import DigFigure from './DigFigure';
import type { DigMood } from './DigFigure';
import sample from './sample.json';
import { DIG_QUIPS, FILE, PERSONAS } from './demoFacts';
import type { PersonaId } from './demoFacts';
import { DEMO_CSS } from './demoStyles';
import {
  AskStop, BASICS, CheckStop, CleanStop, ExploreStop, FilesStop, PlansStop, ReportStop, STOPS, TIP_COUNT, UploadStop, WhatStop,
} from './stops';
import { TourContext } from './tour';
import type { Draft, Line, Plan, Tour } from './tour';

/**
 * The interactive demo. DIG welcomes the visitor, walks them through the
 * basics (upload, check, clean), then opens a map to explore the rest in any
 * order: the report, the chat, the plans and the files.
 *
 * Everything shown is saved output from a real run on a made-up coffee chain
 * (sample.json, public/demo), so the page calls no server and runs no AI.
 */

const SLEEP_AFTER = 45_000;
const LAST = STOPS.length - 1;
const FIRST: Draft = {
  title: sample.report.title,
  order: sample.report.insights.map((_, i) => i),
  hidden: [],
  notes: [],
  by: 'You',
};
const fmt = (n: number) => n.toLocaleString('en-US');

// Confetti, laid out once so every burst looks the same. A fifth are beans.
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  x: (i * 37) % 100,
  dx: ((i * 53) % 90) - 45,
  d: (i % 7) * 0.06,
  t: 1.3 + (i % 5) * 0.18,
  r: (i * 47) % 360,
  c: ['var(--lime)', 'var(--cobalt-accent)', '#f472b6', '#fbbf24', 'bean'][i % 5],
}));

export default function DemoTour() {
  const { brightness, setBrightness } = useSettings();
  const light = brightness > LIGHT_ABOVE;

  const [welcome, setWelcome] = useState(true);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [stop, setStop] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [unlocked, setUnlocked] = useState(false);
  const [furthestStop, setFurthestStop] = useState(0);
  const [walk, setWalk] = useState<0 | 1 | -1>(0);
  const [line, setLine] = useState<Line>({ mood: 'wave', say: 'Hi! I’m DIG, your guide.' });
  const [lineKey, setLineKey] = useState(0);
  const [hop, setHop] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [spin, setSpin] = useState(false);
  const [pop, setPop] = useState<{ text: string; key: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [plan, setPlanState] = useState<Plan>('free');
  const [drafts, setDrafts] = useState<Draft[]>([FIRST]);
  const [look, setLook] = useState({ x: 0, y: 0 });

  // What handlers need to read without waiting for a render.
  const arrivals = useRef<Record<number, () => Line>>({});
  const stopRef = useRef(0);
  const furthest = useRef(0);
  const unlockedRef = useRef(false);
  const welcomeRef = useRef(true);
  const welcomeBoxRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef<ReadonlySet<string>>(seen);
  const planRef = useRef<Plan>('free');
  const draftsRef = useRef<Draft[]>([FIRST]);
  const lastActive = useRef(0);
  const pokes = useRef<number[]>([]);
  const quip = useRef(0);
  const popKey = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const digRef = useRef<HTMLButtonElement | null>(null);
  const workRef = useRef<HTMLDivElement | null>(null);
  const firstPersonaRef = useRef<HTMLButtonElement | null>(null);

  const after = useCallback((name: string, fn: () => void, ms: number) => {
    clearTimeout(timers.current[name]);
    timers.current[name] = setTimeout(fn, ms);
  }, []);

  useEffect(() => {
    const all = timers.current;
    return () => Object.values(all).forEach(clearTimeout);
  }, []);

  const say = useCallback((next: Line) => {
    setLine(next);
    setLineKey(k => k + 1);
    setAsleep(false);
    lastActive.current = Date.now();
  }, []);

  const burst = useCallback(() => {
    setConfetti(c => c + 1);
    after('confetti', () => setConfetti(0), 2600);
  }, [after]);

  const done = useCallback((text: string) => {
    popKey.current += 1;
    setPop({ text, key: popKey.current });
    setHop(true);
    after('pop', () => setPop(null), 4800);
    after('hop', () => setHop(false), 1300);
  }, [after]);

  const seeTip = useCallback((id: string) => {
    if (seenRef.current.has(id)) return;
    const next = new Set(seenRef.current);
    next.add(id);
    seenRef.current = next;
    setSeen(next);
    if (next.size === TIP_COUNT) {
      done('You opened every single tip. Data detective! 🕵️');
      burst();
    }
  }, [done, burst]);

  const go = useCallback((target: number, force = false) => {
    if (target < 0 || target > LAST) return;
    if (!force && !unlockedRef.current && target > furthest.current + 1) {
      say(target < BASICS
        ? { mood: 'no', say: `One step at a time! ${STOPS[target].label} comes right after ${STOPS[target - 1].label}.` }
        : { mood: 'no', say: 'That one opens after the basics: three quick steps, promise! Or press Skip the basics.' });
      return;
    }
    if (target >= BASICS && !unlockedRef.current) {
      unlockedRef.current = true;
      setUnlocked(true);
      done('Basics done! The whole demo is open now. Explore in any order.');
      burst();
    }
    setWalk(target < stopRef.current ? -1 : 1);
    after('walk', () => setWalk(0), 760);
    stopRef.current = target;
    furthest.current = Math.max(furthest.current, target);
    setFurthestStop(furthest.current);
    setStop(target);
    setVisited(v => (v.has(target) ? v : new Set(v).add(target)));
    const arrive = arrivals.current[target];
    if (arrive) say(arrive());
    if (target === LAST) burst();
    const work = workRef.current;
    if (work && work.getBoundingClientRect().top < 0) {
      work.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [after, burst, done, say]);

  const setPlan = useCallback((next: Plan) => {
    if (next === planRef.current) return;
    planRef.current = next;
    setPlanState(next);
    done(next === 'pro'
      ? 'Pro view: Word and PowerPoint, steering the report and team editing are unlocked. ✨'
      : 'Free view: the full report, the PDF and the cleaned data. Plenty to start.');
    say(next === 'pro'
      ? { mood: 'cheer', say: 'Pro mode! Look around: locked things are open now. 🔓' }
      : { mood: 'idle', say: 'Back to Free. Still a full report on any file.' });
  }, [done, say]);

  const commit = useCallback<Tour['commit']>((change, message, by = 'You') => {
    const list = draftsRef.current;
    const current = list[list.length - 1];
    const next = change(current);
    if (next === current) return;
    const saved = [...list, { ...next, by }];
    draftsRef.current = saved;
    setDrafts(saved);
    done(`${message} Saved as version ${saved.length}.`);
  }, [done]);

  const undo = useCallback(() => {
    const list = draftsRef.current;
    if (list.length < 2) return;
    const back = list.slice(0, -1);
    draftsRef.current = back;
    setDrafts(back);
    say({ mood: 'idle', say: `Back to version ${back.length}. ↶` });
  }, [say]);

  const register = useCallback((i: number, arrive: () => Line) => {
    arrivals.current[i] = arrive;
  }, []);

  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  function startTour() {
    welcomeRef.current = false;
    setWelcome(false);
    go(0);
    // The intro has said its piece; bring the first task into view.
    const work = workRef.current;
    if (work && work.getBoundingClientRect().top > window.innerHeight * 0.45) {
      work.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }

  const startRef = useRef(startTour);
  useEffect(() => {
    startRef.current = startTour;
  });

  function skipBasics() {
    go(BASICS, true);
    say({ mood: 'cheer', say: 'Skipped ahead! Everything is open now: pick any card. 🗺️' });
  }

  function poke() {
    const now = Date.now();
    if (asleep) {
      say({ mood: 'cheer', say: 'Oh! I wasn’t sleeping. I was… indexing. 😳' });
      return;
    }
    pokes.current = [...pokes.current.filter(t => now - t < 2500), now];
    if (pokes.current.length >= 5) {
      pokes.current = [];
      setSpin(true);
      after('spin', () => setSpin(false), 1000);
      say({ mood: 'cheer', say: 'Wheee! 🌀 You found my secret spin.' });
      return;
    }
    const text = DIG_QUIPS[quip.current % DIG_QUIPS.length];
    quip.current += 1;
    say({ mood: 'cheer', say: text });
    after('settle', () => setLine(l => (l.say === text ? { ...l, mood: 'idle' } : l)), 1600);
  }

  // DIG's eyes follow the pointer, and DIG naps when nobody is around.
  useEffect(() => {
    lastActive.current = Date.now();
    let frame = 0;
    let last: PointerEvent | null = null;
    const track = () => {
      frame = 0;
      const r = digRef.current?.getBoundingClientRect();
      if (!last || !r || r.width === 0) return;
      const x = (last.clientX - (r.left + r.width / 2)) / 260;
      const y = (last.clientY - (r.top + r.height * 0.3)) / 260;
      setLook({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
    };
    const onMove = (e: PointerEvent) => {
      lastActive.current = Date.now();
      last = e;
      if (!frame) frame = window.requestAnimationFrame(track);
    };
    const onActive = () => { lastActive.current = Date.now(); };
    const nap = setInterval(() => {
      if (!welcomeRef.current && Date.now() - lastActive.current > SLEEP_AFTER) setAsleep(true);
    }, 5000);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onActive);
    window.addEventListener('keydown', onActive);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      clearInterval(nap);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onActive);
      window.removeEventListener('keydown', onActive);
    };
  }, []);

  // ← and → move between steps, unless the visitor is typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (welcomeRef.current) {
        // The welcome is a dialog: Escape starts the tour, Tab stays inside it.
        if (e.key === 'Escape') startRef.current();
        const box = welcomeBoxRef.current;
        if (e.key === 'Tab' && box) {
          const items = Array.from(box.querySelectorAll<HTMLElement>('button'));
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.dg-lightbox')) return;
      if (e.key === 'ArrowRight') goRef.current(stopRef.current + 1);
      if (e.key === 'ArrowLeft') goRef.current(stopRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (welcome) firstPersonaRef.current?.focus();
  }, [welcome]);

  const tour = useMemo<Tour>(() => ({
    plan, setPlan, say, done, seeTip, seen, burst, persona, go, drafts, commit, undo, register,
  }), [plan, setPlan, say, done, seeTip, seen, burst, persona, go, drafts, commit, undo, register]);

  const mood: DigMood = asleep ? 'sleep' : hop ? 'cheer' : line.mood;
  const bubble = asleep ? 'Zzz… 💤 (poke me to wake me up)' : line.say;
  const chosen = PERSONAS.find(p => p.id === persona);
  const n = STOPS.length;
  const locked = (i: number) => !unlocked && i > furthestStop + 1;

  function renderStop(i: number) {
    const active = i === stop;
    switch (STOPS[i].key) {
      case 'upload': return <UploadStop active={active} />;
      case 'check': return <CheckStop />;
      case 'clean': return <CleanStop />;
      case 'explore': return <ExploreStop visited={visited} />;
      case 'what': return <WhatStop />;
      case 'report': return <ReportStop active={active} />;
      case 'ask': return <AskStop active={active} />;
      case 'plans': return <PlansStop />;
      case 'files': return <FilesStop />;
    }
  }

  return (
    <TourContext.Provider value={tour}>
      <div className="dg-page" dir="ltr" lang="en">
        <style>{DEMO_CSS}</style>

        <header className="dg-top">
          <div className="dg-head">
            <Link href="/" className="dg-logo" aria-label="DIG home">DIG</Link>
            <span className="dg-tag">DEMO</span>
            <div className="dg-head-right">
              <div className="dg-plan-toggle" role="group" aria-label="Show the demo as">
                <span className="dg-long dg-plan-label">See it as</span>
                <button type="button" aria-pressed={plan === 'free'} onClick={() => setPlan('free')}>Free</button>
                <button type="button" aria-pressed={plan === 'pro'} onClick={() => setPlan('pro')}>Pro</button>
              </div>
              <button
                type="button"
                className="dg-btn ghost small dg-long"
                onClick={() => setBrightness(light ? DARK_BRIGHTNESS : LIGHT_BRIGHTNESS)}
              >
                {light ? '☾ Dark' : '☀ Light'}
              </button>
              <Link href="/register" className="dg-btn lime small">
                <span className="dg-long">Create a free account</span>
                <span className="dg-short">Sign up</span>
              </Link>
            </div>
          </div>

          <nav className="dg-rail" aria-label="Demo steps">
            <div className="dg-chapters" style={{ gridTemplateColumns: `${BASICS}fr ${n - BASICS}fr` }} aria-hidden="true">
              <span className={unlocked ? 'done' : 'now'}>THE BASICS</span>
              <span className={unlocked ? 'now' : ''}>EXPLORE {unlocked ? '' : '🔒'}</span>
            </div>
            <div className="dg-track" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              <span className="dg-line" style={{ left: `calc(100% / ${2 * n})`, right: `calc(100% / ${2 * n})` }} />
              <span
                className="dg-line-done"
                style={{ left: `calc(100% / ${2 * n})`, width: `calc((100% - 100% / ${n}) * ${stop / LAST})` }}
              />
              <span
                className={'dg-walker' + (walk ? ' walking' : '')}
                style={{ left: `${((stop + 0.5) / n) * 100}%` }}
                aria-hidden="true"
              >
                <span style={{ display: 'block', transform: walk === -1 ? 'scaleX(-1)' : 'none' }}>
                  <DigFigure mood={mood === 'sleep' ? 'sleep' : 'idle'} size={36} />
                </span>
              </span>
              {STOPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  className={'dg-stop' + (visited.has(i) ? ' seen' : '') + (locked(i) ? ' locked' : '')}
                  aria-current={i === stop ? 'step' : undefined}
                  aria-label={s.label + (!locked(i) ? '' : i < BASICS ? `, opens after ${STOPS[i - 1].label}` : ', opens after the basics')}
                  onClick={() => go(i)}
                >
                  <span className="dg-dot" aria-hidden="true" />
                  <span className="dg-label">{s.label}</span>
                </button>
              ))}
            </div>
          </nav>
        </header>

        <section className="dg-intro">
          <div className="dg-intro-in">
            <div>
              <p className="dg-eyebrow">INTERACTIVE DEMO · NO SIGN-UP</p>
              <h1>Take DIG for a spin.</h1>
            </div>
            <div className="dg-ba" aria-label="Before and after">
              <div className="dg-ba-box">
                <span className="dg-ba-k">BEFORE</span>
                <strong>{sample.file.name}</strong>
                <span>{fmt(FILE.rows)} rows of numbers</span>
              </div>
              <span className="dg-ba-arrow" aria-hidden="true">→</span>
              <div className="dg-ba-box after">
                <span className="dg-ba-k">AFTER</span>
                <strong>{sample.report.insights.length} findings in plain words</strong>
                <span>{sample.report.insights.length} charts · PDF, Word, PowerPoint</span>
              </div>
            </div>
            <p className="dg-intro-note">
              This is a sample: everything here is DIG’s saved output from a real run, so nothing you do is uploaded and no AI runs.
            </p>
          </div>
        </section>

        <div className="dg-work" ref={workRef}>
          <aside className="dg-guide" aria-label="DIG, your guide">
            <div className="dg-say" aria-live="polite">
              <p key={lineKey} className="dg-bubble">{bubble}</p>
            </div>
            <div className="dg-digwrap">
              <button
                ref={digRef}
                type="button"
                className={'dg-digbtn' + (spin ? ' spin' : '')}
                onClick={poke}
                aria-label="Poke DIG"
              >
                <DigFigure mood={mood} size={150} look={look} />
              </button>
              <span className="dg-stand" aria-hidden="true" />
            </div>
            <div className="dg-nav">
              <button type="button" className="dg-btn ghost" disabled={stop === 0} onClick={() => go(stop - 1)} aria-label="Back">
                ← <span className="dg-long">Back</span>
              </button>
              <button type="button" className="dg-btn lime" onClick={() => go(stop === LAST ? BASICS : stop + 1)}>
                {stop === LAST ? 'Back to the map' : `Next: ${STOPS[stop + 1].label} →`}
              </button>
            </div>
            {!unlocked && (
              <button type="button" className="dg-skip" onClick={skipBasics}>Skip the basics →</button>
            )}
            <div className="dg-meter">
              Tips opened <strong>{seen.size} of {TIP_COUNT}</strong>
              <div className="dg-meter-bar"><span style={{ width: `${(seen.size / TIP_COUNT) * 100}%` }} /></div>
            </div>
            {unlocked && stop !== LAST && (
              <Link href="/register" className="dg-side-cta">Like it? Try your own file, free →</Link>
            )}
            <p className="dg-keys">Tip: the ← → keys move between steps.</p>
          </aside>

          <main className="dg-stages">
            {STOPS.map((s, i) => (
              <section key={s.key} className="dg-stage" hidden={i !== stop} aria-label={s.label}>
                {renderStop(i)}
              </section>
            ))}
          </main>
        </div>

        <div className="dg-pop-zone" role="status" aria-live="polite">
          {pop && (
            <div key={pop.key} className="dg-pop">
              <span className="dg-pop-bubble"><strong>Done!</strong> {pop.text}</span>
              <span className="dg-pop-dig" aria-hidden="true"><DigFigure mood="cheer" size={96} /></span>
              <button type="button" className="dg-pop-x" aria-label="Close" onClick={() => setPop(null)}>×</button>
            </div>
          )}
        </div>

        {confetti > 0 && (
          <div key={confetti} className="dg-confetti" aria-hidden="true">
            {CONFETTI.map((p, i) => (
              <i
                key={i}
                className={p.c === 'bean' ? 'bean' : undefined}
                style={{
                  '--x': `${p.x}%`, '--dx': `${p.dx}px`, '--d': `${p.d}s`, '--t': `${p.t}s`, '--r': `${p.r}deg`, '--c': p.c,
                } as CSSProperties}
              />
            ))}
          </div>
        )}

        {welcome && (
          <div ref={welcomeBoxRef} className="dg-welcome" role="dialog" aria-modal="true" aria-labelledby="dg-welcome-title">
            <div className="dg-welcome-card">
              <div className="dg-welcome-dig" aria-hidden="true">
                <DigFigure mood={persona ? 'cheer' : 'wave'} size={190} look={look} />
                <span className="dg-stand" />
              </div>
              <div className="dg-welcome-text">
                <p className="dg-eyebrow">WELCOME TO THE DEMO</p>
                <h2 id="dg-welcome-title" className="dg-h2">Hi, I’m DIG! 👋</h2>
                <p className="dg-lead">
                  I turn spreadsheets into reports anyone can read. Let’s see a demo: I’ll work on a real file while you click around.
                </p>
                <p className="dg-q2">First, what brings you here?</p>
                <div className="dg-personas">
                  {PERSONAS.map((p, i) => (
                    <button
                      key={p.id}
                      ref={i === 0 ? firstPersonaRef : undefined}
                      type="button"
                      aria-pressed={persona === p.id}
                      onClick={() => setPersona(p.id)}
                    >
                      <span aria-hidden="true">{p.emoji}</span> {p.label}
                    </button>
                  ))}
                </div>
                <p className="dg-persona-line" aria-live="polite">{chosen ? chosen.line : ' '}</p>
                <button type="button" className="dg-btn lime dg-ring dg-go" onClick={startTour}>
                  Let’s see a demo →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TourContext.Provider>
  );
}
