import Link from 'next/link';

import { CheckIcon } from '@/components/Icons';
import { PRICING } from './homeCopy';
import type { Lang } from './homeCopy';

/** Free and Pro, with their prices and limits, on the landing page itself. */
export default function PricingSection({ lang, eyebrow }: { lang: Lang; eyebrow: string }) {
  const t = PRICING[lang];

  return (
    <section id="pricing" className="hp-section">
      <div className="hp-in">
        <p data-rv="solid" className="hp-eyebrow">{eyebrow.toUpperCase()}</p>
        <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
        <p data-rv="solid" className="hp-sub">{t.sub}</p>

        <div className="hp-plans">
          {([['free', t.free], ['pro', t.pro]] as const).map(([id, plan]) => (
            <div key={id} data-rv className={'hp-plan hp-plan-' + id}>
              <h3>{plan.name}</h3>
              <p className="hp-price"><strong>{plan.price}</strong> <span>{plan.per}</span></p>
              <p className="hp-lead">{plan.lead}</p>
              <ul>
                {plan.items.map(item => (
                  <li key={item}><CheckIcon size={15} /> <span>{item}</span></li>
                ))}
              </ul>
              <Link href="/register" className={'hp-btn' + (id === 'pro' ? ' hp-lime' : ' hp-ink')}>{plan.cta}</Link>
            </div>
          ))}
        </div>
        <p data-rv className="hp-paynote">{t.note}</p>
      </div>
    </section>
  );
}
