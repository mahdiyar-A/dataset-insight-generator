import Image from 'next/image';

import { CheckIcon } from '@/components/Icons';
import { HERO_SHOT, PROOF, SHARE, percent } from './homeCopy';
import type { Lang } from './homeCopy';

/**
 * The product, under the title: a report on the sample file with a question
 * answered beside it, framed like the app. The finding, its figure, the chart
 * and the question are the sample's own (PROOF, chart_1.png), so the picture
 * says nothing the product does not.
 *
 * It is a picture, so screen readers get one sentence for it rather than
 * every label inside.
 */
export default function HeroShot({ lang }: { lang: Lang }) {
  const t = HERO_SHOT[lang];
  const p = PROOF[lang];
  const qa = p.answers[1];

  return (
    <div className="hp-win" role="img" aria-label={t.label}>
      <div className="hp-win-bar">
        <span className="hp-win-dots"><i /><i /><i /></span>
        <span className="hp-win-file" dir="ltr">coffee_sales.csv</span>
        <span className="hp-win-ready"><CheckIcon size={11} /> {t.ready}</span>
      </div>

      <div className="hp-win-body">
        <div className="hp-win-main">
          <div className="hp-win-tabs">
            {t.tabs.map((tab, i) => <span key={tab} className={i === 0 ? 'hp-on' : undefined}>{tab}</span>)}
          </div>
          <p className="hp-win-eyebrow">{t.finding}</p>
          <p className="hp-win-title">{p.finding}</p>
          <p className="hp-win-stat"><strong>{percent(lang, SHARE)}</strong> <span>{p.share}</span></p>
          <Image src="/demo/chart_1.png" alt="" width={1183} height={658} className="hp-win-chart" priority />
        </div>

        <div className="hp-win-side">
          <p className="hp-win-eyebrow">{t.ask}</p>
          <p className="hp-win-q">{qa.q}</p>
          <div className="hp-win-a">
            <span className="hp-badge">{qa.badge}</span>
            <p>{qa.a}</p>
          </div>
          <p className="hp-win-input">{t.placeholder}</p>
        </div>
      </div>
    </div>
  );
}
