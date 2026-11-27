import { ChevronIcon } from '@/components/Icons';
import { CONTACT_EMAIL, FAQ } from './homeCopy';
import type { Lang } from './homeCopy';

/**
 * The questions people ask before signing up. Each answer is a fact the
 * product or its Privacy Policy already states; the figures come from
 * demoFacts through homeCopy. Plain <details>, so it opens without a script.
 */
export default function FaqSection({ lang }: { lang: Lang }) {
  const t = FAQ[lang];

  return (
    <section id="faq" className="hp-section hp-alt">
      <div className="hp-in hp-faq-grid">
        <div>
          <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
          <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
          <p data-rv="solid" className="hp-sub">
            <a href={'mailto:' + CONTACT_EMAIL}>{t.sub}</a>
          </p>
        </div>

        <div className="hp-faq">
          {t.items.map(item => (
            <details key={item.q} data-rv>
              <summary>
                <span>{item.q}</span>
                <ChevronIcon size={18} />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
