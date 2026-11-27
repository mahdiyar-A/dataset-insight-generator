import { LinkedInIcon } from '@/components/Icons';
import { FOUNDER, LINKEDIN } from './homeCopy';
import type { Lang } from './homeCopy';

/**
 * Who builds DIG, and why, in the founder's words: a name, a role, a school,
 * a LinkedIn link, and nothing more personal.
 */
export default function FounderSection({ lang }: { lang: Lang }) {
  const t = FOUNDER[lang];

  return (
    <section id="founder" className="hp-section">
      <div className="hp-in hp-founder">
        <div data-rv className="hp-founder-card">
          <div className="hp-founder-mono" aria-hidden="true">MA</div>
          <div className="hp-founder-who">
            <strong>{t.name}</strong>
            <span>{t.role}</span>
            <span>{t.school}</span>
            <a href={LINKEDIN.founder} target="_blank" rel="noopener noreferrer" className="hp-founder-in">
              <LinkedInIcon size={18} /> {t.linkedin}
            </a>
          </div>
        </div>

        <div>
          <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
          <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
          <blockquote data-rv="solid" className="hp-quote"><p>{t.quote}</p></blockquote>
          <p data-rv="solid" className="hp-founder-origin">{t.origin}</p>
        </div>
      </div>
    </section>
  );
}
