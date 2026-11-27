import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowIcon, CheckIcon, ChevronIcon, PlayIcon } from '@/components/Icons';
import ClosingSection from './ClosingSection';
import HeroShot from './HeroShot';
import { HOME_CSS } from './homeStyles';
import SiteFooter from './SiteFooter';
import { FREE_LINE, USE_CASE_LIST } from './useCases';
import type { UseCase } from './useCases';
import { USE_CASE_CSS } from './useCaseStyles';

/**
 * The page for one file problem: what hurts, what DIG does about it, a real
 * report, the steps, what to know first, and the questions people ask.
 *
 * A server component with no script of its own, so search engines and slow
 * phones get the whole page as HTML. It borrows the homepage's parts (the
 * product window, the closing call, the footer) so it looks like the same
 * site.
 */

export function metadataFor(page: UseCase): Metadata {
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: 'website',
      siteName: 'Dataset Insight Generator',
      url: page.path,
      title: page.h1,
      description: page.description,
    },
  };
}

export default function UseCasePage({ page }: { page: UseCase }) {
  const others = USE_CASE_LIST.filter(p => p.path !== page.path);

  return (
    <div className="uc-page">
      <style>{HOME_CSS + USE_CASE_CSS}</style>

      <header className="uc-bar">
        <Link href="/" className="uc-logo" aria-label="DIG home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/DIG.png" alt="" width={79} height={34} />
          <span>DIG</span>
        </Link>
        <nav className="uc-nav" aria-label="Site">
          <Link href="/demo" className="uc-wide">Demo</Link>
          <Link href="/plans" className="uc-wide">Pricing</Link>
          <Link href="/login">Log in</Link>
        </nav>
        <Link href="/register" className="hp-btn hp-lime">Start free</Link>
      </header>

      <main>
        <section className="uc-hero">
          <div className="hp-in">
            <p className="hp-eyebrow">{page.eyebrow}</p>
            <h1 className="uc-h1">{page.h1}</h1>
            <p className="uc-lead">{page.lead}</p>
            <div className="uc-btns">
              <Link href="/register" className="hp-btn hp-lime">Create a free account</Link>
              <Link href="/demo" className="hp-btn uc-ghost"><PlayIcon size={14} /> Try the demo</Link>
            </div>
            <p className="uc-fine">{FREE_LINE}</p>
            <ul className="uc-exts" aria-label="File types">
              {page.exts.map(ext => <li key={ext}>{ext}</li>)}
            </ul>
          </div>
        </section>

        <section className="hp-section" id="what">
          <div className="hp-in">
            <p className="hp-eyebrow">WHAT DIG DOES</p>
            <h2 className="hp-h2">{page.pain.heading}</h2>
            <p className="hp-sub">{page.pain.body}</p>
            <ul className="uc-cards">
              {page.does.map(item => (
                <li key={item.title}>
                  <CheckIcon size={18} />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="hp-section hp-alt" id="report">
          <div className="hp-in">
            <p className="hp-eyebrow">A REAL REPORT</p>
            <h2 className="hp-h2">This is what comes back.</h2>
            <p className="hp-sub">
              DIG wrote this from a sample sales file: the finding, the number behind it, a chart,
              and an answer to a question about the data.
            </p>
            <div className="uc-shot"><HeroShot lang="en" /></div>
            <p className="uc-shot-foot">
              <Link href="/demo">Click through the whole report in the demo <ArrowIcon size={14} /></Link>
            </p>
          </div>
        </section>

        <section className="hp-section" id="how">
          <div className="hp-in">
            <p className="hp-eyebrow">HOW IT WORKS</p>
            <h2 className="hp-h2">From file to report in four steps.</h2>
            <ol className="uc-steps">
              {page.steps.map(step => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="hp-section hp-alt" id="faq">
          <div className="hp-in hp-faq-grid">
            <div>
              <p className="hp-eyebrow">GOOD TO KNOW</p>
              <h2 className="hp-h2">Before you upload.</h2>
              <ul className="uc-limits">
                {page.limits.map(line => <li key={line}><ArrowIcon size={14} /><span>{line}</span></li>)}
              </ul>
            </div>
            <div className="hp-faq">
              {page.faq.map(item => (
                <details key={item.q}>
                  <summary><span>{item.q}</span><ChevronIcon size={18} /></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-section" id="more">
          <div className="hp-in">
            <p className="hp-eyebrow">MORE FILES</p>
            <h2 className="hp-h2">Other files DIG handles.</h2>
            <div className="uc-more">
              {others.map(other => (
                <Link key={other.path} href={other.path}>
                  <small>{other.eyebrow}</small>
                  <strong>{other.h1}</strong>
                </Link>
              ))}
              <Link href="/">
                <small>EVERYTHING ELSE</small>
                <strong>CSV, Excel, JSON, Stata, SAS, SQLite and more.</strong>
              </Link>
            </div>
          </div>
        </section>

        <ClosingSection lang="en" />
      </main>

      <SiteFooter lang="en" />
    </div>
  );
}
