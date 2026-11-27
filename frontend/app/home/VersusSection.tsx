'use client';

import { useState } from 'react';

import { ArrowIcon, CheckIcon, PlusIcon, UndoIcon } from '@/components/Icons';
import { TEAM } from '../demo/demoFacts';
import { TITLE_IN, VERSUS } from './versusCopy';
import type { Lang } from './homeCopy';

/**
 * The difference between DIG and a chatbot, as five things to press. Each one
 * opens a small scene that works: the same finding rewritten for a chosen
 * reader, an answer added to the report and undone, a team at work, a figure
 * that shows its sum, and a title in each report language.
 *
 * All of it is saved text about the sample file (versusCopy). Nothing here
 * calls the server or a model.
 */

type Copy = (typeof VERSUS)[Lang];

const LANG_CODES = ['en', 'fr', 'es', 'de', 'zh', 'ar', 'pt', 'fa'];
const START_LANG: Record<Lang, number> = { en: 0, fr: 1, fa: 7 };

export default function VersusSection({ lang }: { lang: Lang }) {
  const t = VERSUS[lang];
  const [power, setPower] = useState(0);
  const p = t.powers[power];

  // The second sentence of the heading is the answer, so it gets the accent.
  const cut = t.heading.indexOf('. ');
  const first = cut > 0 ? t.heading.slice(0, cut + 1) : t.heading;
  const second = cut > 0 ? t.heading.slice(cut + 2) : '';

  return (
    <section id="why" className="hp-vs-wrap">
      <div className="hp-in">
        <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
        <h2 data-rv="solid" className="hp-vs-head">
          {first}{second && <> <em>{second}</em></>}
        </h2>
        <p data-rv="solid" className="hp-sub">{t.sub}</p>

        <div data-rv className="hp-powers">
          <div className="hp-power-tabs" role="tablist" aria-label={t.eyebrow}>
            {t.powers.map((x, i) => (
              <button
                key={x.tab}
                type="button"
                role="tab"
                id={`hp-power-${i}`}
                aria-selected={power === i}
                aria-controls="hp-stage"
                onClick={() => setPower(i)}
              >
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>{x.tab}</span>
                <ArrowIcon size={16} />
              </button>
            ))}
          </div>

          <div key={power} id="hp-stage" className="hp-stage" role="tabpanel" aria-labelledby={`hp-power-${power}`}>
            <h3>{p.title}</h3>
            <p className="hp-stage-body">{p.body}</p>
            <div className="hp-scene">
              {power === 0 && <Readers t={t} />}
              {power === 1 && <Chat t={t} />}
              {power === 2 && <Team t={t} />}
              {power === 3 && <Proof t={t} />}
              {power === 4 && <Languages t={t} lang={lang} />}
            </div>
            {p.pro && <p className="hp-stage-pro"><em>PRO</em> {p.pro}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/** One finding, rewritten for the reader the visitor picks. */
function Readers({ t }: { t: Copy }) {
  const [who, setWho] = useState(0);
  return (
    <>
      <p className="hp-scene-head"><span className="hp-ex">{t.example}</span> {t.readersNote}</p>
      <div className="hp-picks" role="group" aria-label={t.readersNote}>
        {t.readers.map((r, i) => (
          <button key={r.who} type="button" aria-pressed={who === i} onClick={() => setWho(i)}>{r.who}</button>
        ))}
      </div>
      <p key={who} className="hp-scene-out" aria-live="polite">{t.readers[who].text}</p>
    </>
  );
}

/** An answer from the chat, added to the report as a new version, and undone. */
function Chat({ t }: { t: Copy }) {
  const c = t.chat;
  const [version, setVersion] = useState(1);
  const added = version === 2;
  return (
    <div className="hp-chat">
      <div className="hp-chat-log">
        <p className="hp-chat-q">{c.ask}</p>
        <div className="hp-chat-a">
          <p>{c.answer}</p>
          {added ? (
            <p className="hp-chat-offer hp-chat-done"><CheckIcon size={13} /> {c.added}</p>
          ) : (
            <p className="hp-chat-offer">
              <span>{c.offer}</span>
              <button type="button" onClick={() => setVersion(2)}><PlusIcon size={13} /> {c.add}</button>
            </p>
          )}
        </div>
      </div>
      <div className="hp-mini" aria-live="polite">
        <p className="hp-mini-bar">
          <span>{c.version(version)}</span>
          {added && <button type="button" onClick={() => setVersion(1)}><UndoIcon size={12} /> {c.undo}</button>}
        </p>
        <p className="hp-mini-title"><b>4</b> {c.finding}</p>
        {added && <p className="hp-mini-note">{c.answer}</p>}
      </div>
    </div>
  );
}

/** A team in one report: who can do what, an edit going on, a thread. */
function Team({ t }: { t: Copy }) {
  const [who, setWho] = useState<string | null>(null);
  const look = (id: string) => TEAM.find(m => m.id === id)!;
  const face = (id: string, name: string) => (id === 'you' ? name : name.slice(0, 1));
  const picked = t.team.people.find(x => x.id === who);
  return (
    <div className="hp-team">
      <div className="hp-team-faces">
        {t.team.people.map(x => (
          <button
            key={x.id}
            type="button"
            aria-pressed={who === x.id}
            aria-label={`${x.name}, ${x.role}`}
            title={`${x.name}, ${x.role}`}
            style={{ background: look(x.id).color, color: look(x.id).on }}
            onClick={() => setWho(w => (w === x.id ? null : x.id))}
          >
            {face(x.id, x.name)}
          </button>
        ))}
        <span className="hp-live"><i aria-hidden="true" /> LIVE</span>
      </div>
      <p className="hp-team-info" aria-live="polite">
        {picked ? <><b>{picked.name} · {picked.role}.</b> {picked.can}</> : t.team.pick}
      </p>
      <div className="hp-team-doc">
        <p className="hp-team-edit">
          <span className="hp-flag" style={{ background: look('sam').color, color: look('sam').on }}>Sam</span>
          {t.team.editing}<span className="hp-caret" aria-hidden="true" />
        </p>
        <p className="hp-team-say hp-say-1">
          <span className="hp-face" style={{ background: look('leo').color, color: look('leo').on }}>L</span>
          <span>{t.team.comment}</span>
        </p>
        <p className="hp-team-say hp-say-2">
          <span className="hp-face" style={{ background: look('priya').color, color: look('priya').on }}>P</span>
          <span>{t.team.reply}</span>
        </p>
      </div>
    </div>
  );
}

/** A sentence whose figures show where they come from. */
function Proof({ t }: { t: Copy }) {
  const p = t.proof;
  const [n, setN] = useState(0);
  return (
    <div className="hp-proof">
      <p className="hp-proof-line">
        {p.before}
        <button type="button" aria-pressed={n === 1} onClick={() => setN(1)}>{p.n1}</button>
        {p.mid}
        <button type="button" aria-pressed={n === 2} onClick={() => setN(2)}>{p.n2}</button>
        {p.after}
      </p>
      <div className="hp-proof-check" aria-live="polite">
        {n === 0 ? (
          <span className="hp-hint">{p.hint}</span>
        ) : (
          <div key={n} className="hp-proof-in">
            <span className="hp-proof-ok"><CheckIcon size={13} /> {p.ok}</span>
            <p>{n === 1 ? p.check1 : <bdi dir="ltr">{p.check2}</bdi>}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Finding 1's title in each report language. */
function Languages({ t, lang }: { t: Copy; lang: Lang }) {
  const [i, setI] = useState(START_LANG[lang]);
  return (
    <>
      <p className="hp-scene-head"><span className="hp-ex">{t.example}</span> {t.langs.note}</p>
      <div className="hp-picks" role="group" aria-label={t.langs.note}>
        {t.langs.names.map((name, k) => (
          <button key={name} type="button" aria-pressed={i === k} onClick={() => setI(k)}>{name}</button>
        ))}
      </div>
      <p key={i} className="hp-scene-out hp-lang-out" dir={TITLE_IN[i].dir} lang={LANG_CODES[i]} aria-live="polite">
        {TITLE_IN[i].text}
      </p>
    </>
  );
}
