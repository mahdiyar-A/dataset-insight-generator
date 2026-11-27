import Link from 'next/link';

import { ArrowIcon, FileIcon, LockIcon, TrashIcon } from '@/components/Icons';
import { TRUST } from './homeCopy';
import type { Lang } from './homeCopy';

const ICONS = [FileIcon, LockIcon, TrashIcon];

/**
 * Three promises a customer cares about, in their words. How the site is built
 * is not one of them, so it is not here; the Privacy Policy has the detail for
 * anyone who wants it.
 */
export default function SecuritySection({ lang }: { lang: Lang }) {
  const t = TRUST[lang];

  return (
    <section id="security" className="hp-trust">
      <div className="hp-in">
        <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
        <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
        <p data-rv="solid" className="hp-sub">{t.sub}</p>

        <ul className="hp-promises">
          {t.items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <li key={item.title} data-rv>
                {/* Deleting is the one promise drawn in red. */}
                <span className={'hp-promise-ic' + (Icon === TrashIcon ? ' hp-promise-del' : '')}><Icon size={20} /></span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            );
          })}
        </ul>

        <p data-rv="solid" className="hp-trust-foot">
          <span>{t.note}</span>
          <Link href="/privacy">{t.policy} <ArrowIcon size={13} /></Link>
        </p>
      </div>
    </section>
  );
}
