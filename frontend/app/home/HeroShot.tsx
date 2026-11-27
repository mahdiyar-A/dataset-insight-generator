'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';

import { ArrowIcon, CheckIcon, ChevronIcon, FileIcon } from '@/components/Icons';
import sample from '../demo/sample.json';
import { FILES } from '../demo/demoFacts';
import { CHARTS, HERO } from './heroCopy';
import type { Lang } from './homeCopy';

/**
 * The product, under the title: the sample run in a window that works like
 * the app. Its tabs switch, its five findings step, its charts open, its
 * questions answer, its three dots tuck the window away, hide the chat or
 * make it bigger, and "Report ready" hands over the sample's real files.
 *
 * Everything in it is the sample's (heroCopy). Nothing calls the server or a
 * model: a question typed in gets a line saying where to ask it for real.
 */

const THINK_MS = 650;

type Exchange = { q: string; a: string; badge?: string; kind?: string };

export default function HeroShot({ lang }: { lang: Lang }) {
  const t = HERO[lang];
  const [tab, setTab] = useState(0);
  const [finding, setFinding] = useState(0);
  const [asked, setAsked] = useState<number | null>(0);
  const [talk, setTalk] = useState<Exchange>(() => t.answers[0]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [min, setMin] = useState(false);
  const [chat, setChat] = useState(true);
  const [big, setBig] = useState(false);
  const [files, setFiles] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const filesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The files menu closes on a press elsewhere or Escape, like any menu.
  useEffect(() => {
    if (!files) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiles(false); };
    const onDown = (e: PointerEvent) => {
      if (filesRef.current && !filesRef.current.contains(e.target as Node)) setFiles(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [files]);

  function reply(next: Exchange) {
    window.clearTimeout(timer.current);
    setTalk({ q: next.q, a: '' });
    setThinking(true);
    timer.current = window.setTimeout(() => {
      setThinking(false);
      setTalk(next);
    }, THINK_MS);
  }

  function ask(i: number) {
    setAsked(i);
    reply(t.answers[i]);
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    setAsked(null);
    reply({ q, a: t.offline });
  }

  function openChart(i: number) {
    setFinding(i);
    setTab(0);
  }

  const f = t.findings[finding];
  const step = (by: number) => setFinding(i => (i + by + t.findings.length) % t.findings.length);

  return (
    // The window keeps its own direction: the pages for searches show it in
    // English even when the visitor picked Persian for the site.
    <div className={'hp-win' + (big ? ' hp-win-big' : '') + (min ? ' hp-win-min' : '')} role="group" aria-label={t.label} dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <div className="hp-win-bar">
        <span className="hp-win-dots">
          <button type="button" onClick={() => setMin(m => !m)} aria-pressed={min} title={t.dots.min} aria-label={t.dots.min}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => { setChat(c => !c); setMin(false); }}
            aria-pressed={!chat}
            title={chat ? t.dots.chatOff : t.dots.chatOn}
            aria-label={chat ? t.dots.chatOff : t.dots.chatOn}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
          </button>
          <button
            type="button"
            onClick={() => { setBig(b => !b); setMin(false); }}
            aria-pressed={big}
            title={big ? t.dots.small : t.dots.big}
            aria-label={big ? t.dots.small : t.dots.big}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2v6M2 5h6" /></svg>
          </button>
        </span>
        <span className="hp-win-file" dir="ltr">coffee_sales.csv</span>

        <div className="hp-win-filesbox" ref={filesRef}>
          <button
            type="button"
            className="hp-win-ready"
            aria-expanded={files}
            aria-haspopup="true"
            onClick={() => setFiles(o => !o)}
          >
            <CheckIcon size={11} /> {t.ready} <ChevronIcon size={11} />
          </button>
          {files && (
            <div className="hp-win-files" role="menu" aria-label={t.files}>
              <p>{t.files}</p>
              {FILES.filter(x => x.name !== 'Original file').map(x => {
                const name = x.ext === 'pdf' ? t.pdf : x.ext === 'docx' ? t.docx : x.ext === 'pptx' ? t.pptx : t.csv;
                return (
                  <a
                    key={x.href}
                    role="menuitem"
                    href={x.href}
                    {...(x.ext === 'pdf' ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}
                    onClick={() => setFiles(false)}
                  >
                    <FileIcon size={13} />
                    <span>{name}</span>
                    {x.pro && <em>{t.pro}</em>}
                    <small dir="ltr">{x.size}</small>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {min ? (
        <div className="hp-win-tucked">
          <span>{t.minimised}</span>
          <button type="button" onClick={() => setMin(false)}>{t.reopen} <ArrowIcon size={12} /></button>
        </div>
      ) : (
        <div className={'hp-win-body' + (chat ? '' : ' hp-win-solo')}>
          <div className="hp-win-main">
            <div className="hp-win-tabs" role="tablist">
              {t.tabs.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  id={`hp-tab-${i}`}
                  aria-selected={tab === i}
                  aria-controls={`hp-pane-${i}`}
                  className={tab === i ? 'hp-on' : undefined}
                  onClick={() => setTab(i)}
                >
                  {name}
                </button>
              ))}
            </div>

            {tab === 0 && (
              <div role="tabpanel" id="hp-pane-0" aria-labelledby="hp-tab-0" className="hp-win-pane">
                <div className="hp-win-step">
                  <p className="hp-win-eyebrow">{t.findingOf(finding + 1)}</p>
                  <span className="hp-win-arrows">
                    <button type="button" onClick={() => step(-1)} aria-label={t.prev} title={t.prev}><ArrowIcon size={13} /></button>
                    <button type="button" onClick={() => step(1)} aria-label={t.next} title={t.next}><ArrowIcon size={13} /></button>
                  </span>
                </div>
                <div key={finding} className="hp-win-swap">
                  <p className="hp-win-title">{f.title}</p>
                  <p className="hp-win-stat"><strong>{f.figure}</strong> <span>{f.caption}</span></p>
                  <Image
                    src={CHARTS[finding]}
                    alt={f.chart}
                    width={1183}
                    height={658}
                    className="hp-win-chart"
                    priority={finding === 0}
                  />
                </div>
                <div className="hp-win-pager">
                  {t.findings.map((x, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={x.title}
                      aria-current={finding === i}
                      title={x.title}
                      onClick={() => setFinding(i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === 1 && (
              <div role="tabpanel" id="hp-pane-1" aria-labelledby="hp-tab-1" className="hp-win-pane hp-win-charts">
                {t.findings.map((x, i) => (
                  <button key={i} type="button" onClick={() => openChart(i)} title={x.title}>
                    <Image src={CHARTS[i]} alt="" width={1183} height={658} />
                    <span>{x.chart}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 2 && (
              <div role="tabpanel" id="hp-pane-2" aria-labelledby="hp-tab-2" className="hp-win-pane hp-win-data">
                <p className="hp-win-datanote"><strong>{t.rows}</strong> <span>{t.cleanRows}</span></p>
                <div className="hp-win-tablewrap" dir="ltr">
                  <table>
                    <thead><tr>{sample.file.headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
                    <tbody>
                      {sample.file.preview.map((row, r) => (
                        <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hp-win-foot">{t.dataNote}</p>
              </div>
            )}
          </div>

          {chat && (
            <div className="hp-win-side">
              <p className="hp-win-eyebrow">{t.ask}</p>
              <div className="hp-win-talk" aria-live="polite">
                <p className="hp-win-q">{talk.q}</p>
                {thinking ? (
                  <div className="hp-win-a hp-win-thinking">
                    <span className="hp-dots" aria-hidden="true"><i /><i /><i /></span>
                    <span className="hp-sr">{t.thinking}</span>
                  </div>
                ) : (
                  <div key={talk.a} className="hp-win-a">
                    {talk.badge && <span className={'hp-badge hp-' + talk.kind}>{talk.badge}</span>}
                    <p>{talk.a}</p>
                  </div>
                )}
              </div>
              <p className="hp-win-try">{t.tryAsking}</p>
              <div className="hp-win-chips">
                {t.answers.map((a, i) => (
                  <button key={a.q} type="button" aria-pressed={asked === i} onClick={() => ask(i)}>{a.q}</button>
                ))}
              </div>
              <form className="hp-win-input" onSubmit={send}>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={t.placeholder}
                  aria-label={t.placeholder}
                />
                <button type="submit" aria-label={t.send} title={t.send}><ArrowIcon size={14} /></button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
