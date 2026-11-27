'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { EyeIcon, FlipIcon, PlusIcon } from '@/components/Icons';
import sample from './sample.json';
import { ROLES, TEAM } from './demoFacts';
import type { TeammateId } from './demoFacts';
import { StopHead, useActiveRef, useTimers } from './stops';
import { useArrival, useTour } from './tour';

/**
 * Work together: the sample report open for a whole team at once, the way a
 * shared document is. The team is at the top with each person's role and
 * whether they are here; their cursors, an edit, a moved finding and a
 * comment thread play out in front of the visitor.
 *
 * The visitor only watches. Nothing here can be typed into or changed: a
 * demo anyone can open is not a place anyone can write.
 */

const STOP = 7;

/** What Sam types at the end of finding 2. No figures: nothing to check. */
export const TYPED = ' Ask the Downtown team what they do differently.';
/** The words Leo comments on. They are in the report's summary. */
export const PHRASE = '1.74 times Midtown';
export const COMMENT = { who: 'leo' as TeammateId, text: 'Is Downtown ahead at weekends too?' };
export const REPLY = { who: 'priya' as TeammateId, text: 'Good question. Let’s ask DIG in the chat.' };

const TYPE_MS = 45;
const SHOWN = 3; // findings shown on the page; the rest are listed by count

type Log = { who: TeammateId; text: string; when: string };

const person = (id: TeammateId) => TEAM.find(t => t.id === id)!;
const faceStyle = (id: TeammateId) => {
  const p = person(id);
  return { '--c': p.color, '--on': p.on } as CSSProperties;
};

/** A teammate's cursor: a coloured line with their name on a flag. */
function Caret({ who }: { who: TeammateId }) {
  return (
    <span className="dg-caret" style={faceStyle(who)} aria-label={`${person(who).name}’s cursor`}>
      <b aria-hidden="true">{person(who).name}</b>
    </span>
  );
}

const START_LOG: Log[] = [
  { who: 'ana', text: 'shared the report with the team', when: 'yesterday' },
  { who: 'you', text: 'opened the report', when: 'just now' },
];

const STATUS_START: Record<TeammateId, string> = { you: 'here', sam: '', priya: '', leo: '', ana: '' };

function reducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function TeamStop({ active }: { active: boolean }) {
  const tour = useTour();
  const activeRef = useActiveRef(active);
  const later = useTimers();
  const [ran, setRan] = useState(false);
  const [done, setDone] = useState(false);
  const [here, setHere] = useState<TeammateId[]>(['you']);
  const [status, setStatus] = useState(STATUS_START);
  const [samAt, setSamAt] = useState(false);
  const [typed, setTyped] = useState(0);
  const [leoSel, setLeoSel] = useState(false);
  const [thread, setThread] = useState(0);
  const [priyaAt, setPriyaAt] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>(() => Array.from({ length: SHOWN }, (_, i) => i));
  const [flash, setFlash] = useState<number | null>(null);
  const [version, setVersion] = useState(1);
  const [savedBy, setSavedBy] = useState('');
  const [log, setLog] = useState<Log[]>(START_LOG);
  const [touched, setTouched] = useState(false);
  const insights = sample.report.insights;

  useArrival(STOP, () => done
    ? { mood: 'cheer', say: 'That’s Pro teams: up to 5 people on one report. Owners run the team, editors change the report, viewers read and comment.' }
    : { mood: 'point', say: 'One report, a whole team on it at once. Watch the cursors, the edit and the comment. You can look, but no touching! 👀' });

  const note = (who: TeammateId, text: string) => setLog(l => [{ who, text, when: 'just now' }, ...l]);
  const doing = (who: TeammateId, what: string) => setStatus(s => ({ ...s, [who]: what }));
  const save = (who: TeammateId) => {
    setVersion(v => v + 1);
    setSavedBy(person(who).name);
  };

  function play() {
    setRan(true);
    setDone(false);
    const join = (who: TeammateId, at: number, what: string) => later(() => {
      setHere(h => (h.includes(who) ? h : [...h, who]));
      doing(who, what);
      note(who, 'opened the report');
    }, at);
    join('sam', 300, 'reading');
    join('priya', 800, 'reading');
    join('leo', 1300, 'reading');

    // Sam adds a sentence to finding 2, a letter at a time.
    later(() => { setSamAt(true); doing('sam', 'typing…'); }, 1800);
    const instant = reducedMotion();
    if (instant) later(() => setTyped(TYPED.length), 1900);
    else for (let i = 1; i <= TYPED.length; i++) later(() => setTyped(i), 1900 + i * TYPE_MS);
    const typedBy = 1900 + TYPED.length * TYPE_MS;

    // Leo, a viewer, selects words in the summary and comments on them.
    later(() => { setLeoSel(true); doing('leo', 'commenting'); }, 2300);
    later(() => {
      setSamAt(false);
      doing('sam', 'editing');
      save('sam');
      note('sam', `added a sentence to “${insights[1].title}”`);
    }, typedBy + 300);
    later(() => { setThread(1); note('leo', `commented on “${PHRASE}”`); }, typedBy + 800);

    // Priya moves finding 3 above finding 2.
    later(() => { setPriyaAt(2); doing('priya', 'moving a finding'); }, typedBy + 1800);
    later(() => {
      setOrder(o => {
        const next = [...o];
        const at = next.indexOf(2);
        if (at > 0) [next[at - 1], next[at]] = [next[at], next[at - 1]];
        return next;
      });
      setFlash(2);
      save('priya');
      note('priya', `moved “${insights[2].title}” up`);
    }, typedBy + 2500);
    later(() => {
      setPriyaAt(null);
      setThread(2);
      doing('priya', 'commenting');
      note('priya', 'replied to Leo');
    }, typedBy + 3400);
    later(() => {
      setDone(true);
      doing('sam', 'editing');
      doing('priya', 'editing');
      doing('leo', 'reading');
      if (activeRef.current) {
        tour.say({ mood: 'cheer', say: 'Two saves and a comment thread, and nobody refreshed a thing. That’s Pro teams: up to 5 people on one report.' });
      }
    }, typedBy + 4200);
  }

  useEffect(() => {
    if (active && !ran) play();
    // play() schedules timers; it runs once, the first time the stop shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function again() {
    setHere(['you']);
    setStatus(STATUS_START);
    setSamAt(false);
    setTyped(0);
    setLeoSel(false);
    setThread(0);
    setPriyaAt(null);
    setOrder(Array.from({ length: SHOWN }, (_, i) => i));
    setFlash(null);
    setVersion(1);
    setSavedBy('');
    setLog(START_LOG);
    tour.say({ mood: 'point', say: 'Once more, from the top! 🎬' });
    play();
  }

  function touch() {
    if (!touched) setTouched(true);
    tour.say({ mood: 'no', say: 'Look, don’t touch! 🙅 In the demo only the team edits. In your own account you’d be editing right alongside them.' });
  }

  const summary = sample.report.summary;
  const cut = summary.indexOf(PHRASE);
  const statusOf = (id: TeammateId) => {
    const p = person(id);
    if (p.away) return p.away;
    if (!here.includes(id)) return 'not here yet';
    return status[id] || 'here';
  };

  return (
    <div>
      <StopHead
        stop={STOP}
        title="Work together"
        lead="A simulated preview with a made-up team, sped up. In the app, your team’s cursors and comments are live, and their changes to the report arrive as soon as they save."
      />

      <div className="dg-live">
        <div className="dg-live-bar">
          <span className="dg-live-doc-icon" aria-hidden="true" />
          <div className="dg-live-name">
            <strong>{sample.report.title}</strong>
            <span>
              Coffee shops team · Version {version} · {savedBy ? `Saved by ${savedBy}` : 'All changes saved'}
            </span>
          </div>
          <div className="dg-live-faces" aria-label={`Here now: ${here.map(id => person(id).name).join(', ')}`}>
            {here.map(id => (
              <span key={id} className="dg-mate" style={faceStyle(id)} title={`${person(id).name} · ${person(id).role}`}>
                {person(id).face}
              </span>
            ))}
          </div>
          <span className="dg-pro-tag">PRO</span>
          <span className="dg-live-lock"><EyeIcon size={13} /> Simulated preview · view only</span>
        </div>

        <ul className="dg-live-team" aria-label="The team">
          {TEAM.map(m => {
            const live = here.includes(m.id) && !m.away;
            return (
              <li key={m.id} className={live ? 'live' : m.away ? 'away' : 'out'}>
                <span className="dg-mate" style={faceStyle(m.id)} aria-hidden="true">{m.face}</span>
                <span className="dg-live-who">
                  <strong>{m.name}</strong>
                  <span className="dg-role">{m.role}</span>
                </span>
                <small>
                  <i className="dg-live-dot" aria-hidden="true" />
                  {statusOf(m.id)}
                </small>
              </li>
            );
          })}
        </ul>

        <div className="dg-live-main">
          {/* Read only: a click is answered by DIG, never by a cursor. */}
          <div
            className="dg-live-page"
            role="region"
            aria-label="The report, open for the team (view only)"
            onClick={touch}
          >
            <h3 className="dg-live-title">{sample.report.title}</h3>
            <p className="dg-live-summary">
              {cut < 0 ? summary : (
                <>
                  {summary.slice(0, cut)}
                  <mark className={'dg-sel' + (leoSel ? ' on' : '')} style={faceStyle('leo')}>{PHRASE}</mark>
                  {leoSel && thread === 0 && <Caret who="leo" />}
                  {summary.slice(cut + PHRASE.length)}
                </>
              )}
            </p>
            {order.map((idx, pos) => {
              const ins = insights[idx];
              return (
                <section
                  key={idx}
                  className={'dg-live-f' + (flash === idx ? ' flash' : '')}
                  onAnimationEnd={() => setFlash(f => (f === idx ? null : f))}
                >
                  <h4>
                    {priyaAt === idx && <Caret who="priya" />}
                    <span className="dg-live-n">{String(pos + 1).padStart(2, '0')}</span> {ins.title}
                  </h4>
                  <p>
                    {ins.body}
                    {idx === 1 && typed > 0 && <span className="dg-typed" style={faceStyle('sam')}>{TYPED.slice(0, typed)}</span>}
                    {idx === 1 && samAt && <Caret who="sam" />}
                  </p>
                </section>
              );
            })}
            <p className="dg-live-more"><PlusIcon size={11} /> {insights.length - SHOWN} more findings, the charts and how we know</p>
          </div>

          <aside className="dg-live-side" aria-label="Comments and activity">
            <p className="dg-eyebrow">COMMENTS</p>
            {thread === 0 ? (
              <p className="dg-live-empty">No comments yet.</p>
            ) : (
              <div className="dg-thread">
                <q>{PHRASE}</q>
                {[COMMENT, REPLY].slice(0, thread).map(c => (
                  <div key={c.who} className="dg-cmt">
                    <span className="dg-mate small" style={faceStyle(c.who)} aria-hidden="true">{person(c.who).face}</span>
                    <span>
                      <strong>{person(c.who).name}</strong> <span className="dg-role">{person(c.who).role}</span>
                      <span className="dg-cmt-text">{c.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="dg-eyebrow">ACTIVITY</p>
            <ol className="dg-live-log" aria-live="polite">
              {log.map((e, i) => (
                <li key={log.length - i}>
                  <span className="dg-mate small" style={faceStyle(e.who)} aria-hidden="true">{person(e.who).face}</span>
                  <span><strong>{person(e.who).name}</strong> {e.text} <small>· {e.when}</small></span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>

      {touched && (
        <p className="dg-note" role="status">
          <span className="dg-kind">View only</span>
          <span>In the demo the team edits and you watch. In your account you edit, comment and share right here with them.</span>
        </p>
      )}

      <div className="dg-live-roles">
        {ROLES.map(r => (
          <div key={r.role} className="dg-live-rolecard">
            <span className="dg-role">{r.role}</span>
            <span>{r.can}</span>
          </div>
        ))}
      </div>

      <div className="dg-row dg-live-again">
        <button type="button" className="dg-btn ghost small" disabled={!done} onClick={again}><FlipIcon size={12} /> Play it again</button>
        {tour.plan === 'free' && (
          <>
            <span className="dg-faint">Teams are part of Pro: up to 5 people, each on Pro.</span>
            <button type="button" className="dg-btn lime small" onClick={() => tour.setPlan('pro')}>See it on Pro</button>
          </>
        )}
      </div>
    </div>
  );
}
