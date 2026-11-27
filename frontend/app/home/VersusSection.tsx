import { VERSUS } from './homeCopy';
import type { Lang } from './homeCopy';

/**
 * The difference between DIG and a chatbot, said as a point of view: one line
 * that answers "why not just ask a chatbot?", then four things DIG does that a
 * chat does not.
 */
export default function VersusSection({ lang }: { lang: Lang }) {
  const t = VERSUS[lang];
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

        <ol className="hp-pillars">
          {t.pillars.map((pillar, i) => (
            <li key={pillar.title} data-rv>
              <b aria-hidden="true">{String(i + 1).padStart(2, '0')}</b>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
