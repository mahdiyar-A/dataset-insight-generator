import Link from 'next/link';

import { PlayIcon } from '@/components/Icons';
import { CLOSING, CONTACT_EMAIL } from './homeCopy';
import type { Lang } from './homeCopy';

/** The last thing on the page: two ways in, and a way to ask. */
export default function ClosingSection({ lang }: { lang: Lang }) {
  const t = CLOSING[lang];

  return (
    <section id="contact" className="hp-close">
      <div className="hp-in">
        <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
        <p data-rv="solid" className="hp-close-sub">{t.sub}</p>
        <div data-rv="solid" className="hp-close-btns">
          <Link href="/demo" className="hp-btn hp-ink"><PlayIcon /> {t.demo}</Link>
          <Link href="/register" className="hp-btn hp-paper">{t.register}</Link>
        </div>
        <p data-rv="solid" className="hp-close-mail">
          {t.ask} <a href={'mailto:' + CONTACT_EMAIL}>{t.write}</a>
        </p>
      </div>
    </section>
  );
}
