import Link from 'next/link';

import { LinkedInIcon } from '@/components/Icons';
import { CONTACT_EMAIL, FOOTER, LINKEDIN } from './homeCopy';
import type { Lang } from './homeCopy';
import { USE_CASE_LIST } from './useCases';

/**
 * Where a visitor looks for the company: what it makes, who is behind it, and
 * the legal pages. The founder's LinkedIn sits here, in place of the old
 * Developer section.
 */
export default function SiteFooter({ lang }: { lang: Lang }) {
  const t = FOOTER[lang];
  const out = { target: '_blank', rel: 'noopener noreferrer' } as const;

  return (
    <footer className="hp-foot">
      <div className="hp-in hp-foot-grid">
        <div className="hp-foot-brand">
          <Link href="/" className="hp-foot-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/DIG.png" alt="" width={79} height={34} />
            <span>DIG</span>
          </Link>
          <p>{t.tagline}</p>
          <a href={LINKEDIN.dig} {...out} className="hp-foot-social" aria-label={t.digOn}>
            <LinkedInIcon size={22} />
          </a>
        </div>

        <nav aria-label={t.product}>
          <p>{t.product}</p>
          <Link href="/demo">{t.demo}</Link>
          <Link href="/#features">{t.features}</Link>
          <Link href="/#pricing">{t.pricing}</Link>
          <Link href="/#faq">{t.faq}</Link>
        </nav>

        {/* English in every language, like Legal: the pages are written for
            English searches. */}
        <nav aria-label={t.uses}>
          <p>{t.uses}</p>
          {USE_CASE_LIST.map(page => <Link key={page.path} href={page.path}>{page.short}</Link>)}
        </nav>

        <nav aria-label={t.company}>
          <p>{t.company}</p>
          <a href={'mailto:' + CONTACT_EMAIL}>{t.contact}</a>
          <a href={LINKEDIN.dig} {...out}>{t.digOn}</a>
          <a href={LINKEDIN.founder} {...out} className="hp-foot-founder">
            <span>{t.founded}</span> {t.founder} <LinkedInIcon size={14} />
          </a>
        </nav>

        {/* Left in English in every language: the pages they open are
            published in English only. */}
        <nav aria-label={t.legal}>
          <p>{t.legal}</p>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>

      <div className="hp-in hp-foot-base">
        <span>{t.rights}</span>
        <span dir="ltr">datainsightgen.com</span>
      </div>
    </footer>
  );
}
