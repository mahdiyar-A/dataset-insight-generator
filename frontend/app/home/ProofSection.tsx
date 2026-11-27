'use client';

import { useState } from 'react';
import Link from 'next/link';

import { ArrowIcon, CheckIcon, FileIcon, UndoIcon } from '@/components/Icons';
import DigFigure from '../demo/DigFigure';
import type { DigMood } from '../demo/DigFigure';
import { CHECK, FILES } from '../demo/demoFacts';
import { BLANKS, MESSY_COLUMNS, MESSY_ROWS, PROOF, num } from './homeCopy';
import type { Answer, Lang } from './homeCopy';

/**
 * The cleaning, done in front of the visitor: the sample file's messy rows,
 * three problems to press (each lights up its rows), and DIG asking before it
 * cleans. "Yes, clean it" shows the same rows as cleaned_coffee_sales.csv has
 * them. Then three questions that show where a figure comes from, and DIG
 * declining one that is not about the file.
 *
 * The report and its charts are in the window under the title, so they are
 * not shown again here. Everything is saved text about the sample file.
 * Nothing calls the server or a model.
 */

const MOOD: Record<Answer['kind'], DigMood> = { worked: 'point', looked: 'cheer', refused: 'no' };
const KINDS = ['dup', 'blank', 'neg'] as const;
type Kind = (typeof KINDS)[number];
const COUNTS = [CHECK.repeatedRows, BLANKS, CHECK.belowZero];
const CLEANED = FILES.find(f => f.href.includes('cleaned'))!;

export default function ProofSection({ lang }: { lang: Lang }) {
  const t = PROOF[lang];
  const [picked, setPicked] = useState(0);
  const [spot, setSpot] = useState<Kind | null>(null);
  const [clean, setClean] = useState(false);
  const answer = t.answers[picked];
  const later = MESSY_ROWS.filter(r => r.flag === 'dup')[1];

  const rowClass = (flag?: Kind) =>
    [flag ? 'hp-' + flag : '', spot && flag !== spot ? 'hp-dim' : '', spot && flag === spot ? 'hp-lit' : '']
      .filter(Boolean).join(' ') || undefined;

  return (
    <section id="proof" className="hp-section">
      <div className="hp-in">
        <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
        <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
        <p data-rv="solid" className="hp-sub">{t.sub}</p>

        <div className="hp-split">
          {/* ── Before: the file as it came ── */}
          <div data-rv className="hp-panel">
            <p className="hp-bar">
              <strong>{t.before}</strong>
              <span dir="ltr">coffee_sales.csv</span>
              <span className="hp-bar-end">{t.rows}</span>
            </p>
            <div className="hp-tablewrap" dir="ltr">
              <table className="hp-table" aria-label={t.tableLabel}>
                <thead>
                  <tr>
                    <th scope="col" className="hp-rown">#</th>
                    {MESSY_COLUMNS.map(c => <th key={c} scope="col" className={'hp-c-' + c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MESSY_ROWS.map(r => (
                    <tr key={r.row} className={rowClass(r.flag)}>
                      <td className="hp-rown">{r.row}</td>
                      {r.cells.map((cell, i) => {
                        const bad = (r.flag === 'blank' && cell === '') || (r.flag === 'neg' && MESSY_COLUMNS[i] === 'units_sold');
                        return (
                          <td key={i} className={'hp-c-' + MESSY_COLUMNS[i]}>
                            {bad ? <mark className="hp-bad">{cell || t.blank}</mark> : cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hp-problems">
              <p>{t.find}</p>
              {KINDS.map((kind, i) => (
                <button
                  key={kind}
                  type="button"
                  className={'hp-' + kind}
                  aria-pressed={spot === kind}
                  onClick={() => setSpot(s => (s === kind ? null : kind))}
                >
                  <i aria-hidden="true" />
                  <strong>{num(lang, COUNTS[i])}</strong> {t.problems[i]}
                </button>
              ))}
            </div>
          </div>

          <span className="hp-arrow" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
              <path d="M3 12h17M13 5l7 7-7 7" />
            </svg>
          </span>

          {/* ── After: DIG asks, then cleans. The class stays the same: the
              reveal on scroll marks this element, and a new className from
              React would wipe that mark and hide the panel. ── */}
          <div data-rv className="hp-panel hp-after" aria-live="polite">
            <p className="hp-bar">
              <strong>{t.after}</strong>
              <span dir="ltr">cleaned_coffee_sales.csv</span>
              {clean && <span className="hp-bar-end">{t.cleanedRows}</span>}
            </p>

            {!clean ? (
              <div className="hp-ask">
                <span className="hp-dig hp-dig-small" aria-hidden="true"><DigFigure mood="think" size={96} /></span>
                <p>{t.askFirst}</p>
                <button type="button" className="hp-btn hp-lime" onClick={() => { setClean(true); setSpot(null); }}>
                  <CheckIcon size={15} /> {t.clean}
                </button>
              </div>
            ) : (
              <div className="hp-clean-in">
                <div className="hp-tablewrap" dir="ltr">
                  <table className="hp-table">
                    <thead>
                      <tr>
                        <th scope="col" className="hp-rown">#</th>
                        {MESSY_COLUMNS.map(c => <th key={c} scope="col" className={'hp-c-' + c}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {MESSY_ROWS.map((r, n) => {
                        const gone = r === later;
                        return (
                          <tr key={r.row} className={gone ? 'hp-gone' : undefined} style={{ animationDelay: `${n * 0.08}s` }}>
                            <td className="hp-rown">{r.row}</td>
                            {r.cells.map((cell, i) => {
                              const col = MESSY_COLUMNS[i];
                              const fixed = (r.flag === 'blank' && cell === '') || (r.flag === 'neg' && col === 'units_sold');
                              return (
                                <td key={i} className={'hp-c-' + col}>
                                  {fixed ? <mark className={'hp-good hp-' + r.flag}>{r.fixed}</mark> : cell}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ul className="hp-notes" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
                  <li className="hp-dup"><i aria-hidden="true" />{t.removed}</li>
                  <li className="hp-blank"><i aria-hidden="true" />{t.filled}</li>
                  <li className="hp-neg"><i aria-hidden="true" />{t.pulled}</li>
                </ul>
                <ul className="hp-done">
                  {COUNTS.map((n, i) => (
                    <li key={i}><CheckIcon size={13} /> <strong>{num(lang, n)}</strong> {t.done[i]}</li>
                  ))}
                </ul>
                <div className="hp-clean-foot">
                  <a href={CLEANED.href} download className="hp-dl"><FileIcon size={14} /> {t.csv}</a>
                  <button type="button" className="hp-again" onClick={() => setClean(false)}><UndoIcon size={13} /> {t.again}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Press one ── */}
        <div data-rv className="hp-try">
          <div className="hp-asks">
            <p className="hp-trytitle">{t.tryTitle}</p>
            {t.answers.map((a, i) => (
              <button key={a.q} type="button" aria-pressed={picked === i} onClick={() => setPicked(i)}>
                {a.q}
              </button>
            ))}
          </div>
          <div className="hp-reply">
            <span className="hp-dig" aria-hidden="true"><DigFigure mood={MOOD[answer.kind]} size={128} /></span>
            <div className="hp-bubble" aria-live="polite">
              <div key={picked} className="hp-bubble-in">
                <span className={'hp-badge hp-' + answer.kind}>{answer.badge}</span>
                <p>{answer.a}</p>
                {answer.sum && <p className="hp-sum"><bdi dir="ltr">{answer.sum}</bdi></p>}
              </div>
            </div>
            <Link href="/demo" className="hp-btn hp-lime">{t.cta} <ArrowIcon size={14} /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
