'use client';

import { useState } from 'react';
import Link from 'next/link';

import DigFigure from '../demo/DigFigure';
import type { DigMood } from '../demo/DigFigure';
import { CHECK, REVENUE } from '../demo/demoFacts';
import { BLANKS, MESSY_COLUMNS, MESSY_ROWS, PROOF, SHARE, money, num, percent } from './homeCopy';
import type { Answer, Lang } from './homeCopy';

/**
 * Shows what DIG does instead of describing it: the sample file's messy rows
 * beside the finding DIG makes of them, then three things to press. The first
 * says where a figure comes from, the last shows DIG declining a question that
 * is not about the file.
 *
 * Everything is saved text about the demo's sample file. Nothing here calls
 * the server or a model.
 */

const MOOD: Record<Answer['kind'], DigMood> = { worked: 'point', looked: 'cheer', refused: 'no' };
const PROBLEM_KIND = ['dup', 'blank', 'neg'] as const;
const PROBLEM_COUNT = [CHECK.repeatedRows, BLANKS, CHECK.belowZero];

export default function ProofSection({ lang }: { lang: Lang }) {
  const t = PROOF[lang];
  const [picked, setPicked] = useState(0);
  const answer = t.answers[picked];
  const most = REVENUE.byProduct[0].total;

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
                    <tr key={r.row} className={r.flag ? 'hp-' + r.flag : undefined}>
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
            <ul className="hp-problems">
              {PROBLEM_COUNT.map((n, i) => (
                <li key={PROBLEM_KIND[i]} className={'hp-' + PROBLEM_KIND[i]}>
                  <i aria-hidden="true" />
                  <strong>{num(lang, n)}</strong> {t.problems[i]}
                </li>
              ))}
            </ul>
          </div>

          <span className="hp-arrow" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
              <path d="M3 12h17M13 5l7 7-7 7" />
            </svg>
          </span>

          {/* ── After: what the report says ── */}
          <div data-rv className="hp-panel hp-after">
            <p className="hp-bar">
              <strong>{t.after}</strong>
              <span className="hp-bar-end">{t.afterNote}</span>
            </p>
            <div className="hp-after-in">
              <h3 className="hp-finding">{t.finding}</h3>
              <p className="hp-figure">
                <button
                  type="button"
                  className="hp-share"
                  onClick={() => setPicked(0)}
                  title={t.shareHint}
                  aria-label={`${percent(lang, SHARE)} ${t.share}. ${t.shareHint}`}
                >
                  {percent(lang, SHARE)}
                </button>
                <span>{t.share}</span>
              </p>
              <p className="hp-charttitle">{t.chartTitle}</p>
              <ul className="hp-bars" dir="ltr">
                {REVENUE.byProduct.map((p, i) => (
                  <li key={p.name} title={`${p.name}: ${money(lang, p.total, 2)}`}>
                    <span className="hp-bar-name">{p.name}</span>
                    <span className="hp-track">
                      <span
                        className={'hp-fill' + (i === 0 ? ' hp-most' : '')}
                        style={{ width: `${(100 * p.total) / most}%`, transitionDelay: `${0.15 + i * 0.07}s` }}
                      />
                    </span>
                    <bdi className="hp-val">{money(lang, p.total)}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Press one ── */}
        <div data-rv className="hp-try">
          <div className="hp-asks">
            <p className="hp-trytitle">{t.tryTitle}</p>
            {t.answers.map((a, i) => (
              <button key={a.kind} type="button" aria-pressed={picked === i} onClick={() => setPicked(i)}>
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
                {answer.kind === 'worked' && (
                  <p className="hp-sum"><bdi dir="ltr">{`${money(lang, most, 2)} ÷ ${money(lang, REVENUE.total, 2)} = ${percent(lang, SHARE)}`}</bdi></p>
                )}
              </div>
            </div>
            <Link href="/demo" className="hp-btn hp-lime">{t.cta}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
