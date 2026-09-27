'use client';

import Link from 'next/link';

import { useSettings } from '@/app/contexts/SettingsContext';

/**
 * Shared chrome for the Privacy and Terms pages.
 *
 * Deliberately plain next to the landing page: legal text is read, not
 * skimmed, so it gets a single measured column, generous line height and no
 * motion. It still follows the Atlas palette so it does not look like a
 * different site.
 *
 * English only, with the note below. The rest of the product is trilingual,
 * but a mistranslated legal clause is worse than an untranslated one — the
 * usual practice is to publish one governing language and say which it is.
 */

const ATLAS = {
  light: {
    paper: '#f2efe9', ink: '#12121a', inkSoft: '#4a4741', inkFaint: '#66635d',
    rule: '#12121a', hairline: 'rgba(18,18,26,0.16)', cobalt: '#2536e0', lime: '#d6f24a',
  },
  dark: {
    paper: '#151a2b', ink: '#f2efe9', inkSoft: '#bcc2d4', inkFaint: '#8e96ad',
    rule: '#f2efe9', hairline: 'rgba(242,239,233,0.18)', cobalt: '#8b95f5', lime: '#d6f24a',
  },
};

const DISPLAY = 'var(--font-display), "Bricolage Grotesque", Georgia, serif';
const SANS = 'var(--font-sans), "Work Sans", system-ui, sans-serif';

export default function LegalPage({ title, updated, intro, sections, closing }) {
  const { brightness, setBrightness } = useSettings();
  const light = brightness > 65;
  const c = light ? ATLAS.light : ATLAS.dark;

  return (
    <div style={{
      background: c.paper, color: c.ink, fontFamily: SANS,
      minHeight: '100vh', overflowX: 'clip',
    }}>
      {/* Touch targets: the header controls are small by design on a pointer
          device, but a 31px button is below the 44px minimum a finger needs,
          so coarse pointers get the padding back. Same approach as the
          landing page's .atlas-tap. */}
      <style>{`
        .lg-link:hover { color: ${c.cobalt} !important; }
        @media (pointer: coarse) {
          .lg-tap {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
          }
        }
      `}</style>

      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: c.paper,
        borderBottom: '2px solid ' + c.rule, padding: '10px clamp(16px, 3vw, 32px)',
        display: 'flex', alignItems: 'center', gap: '16px', minHeight: '58px',
      }}>
        <Link href="/" className="lg-link lg-tap" style={{
          fontFamily: DISPLAY, fontSize: '19px', fontWeight: 800,
          letterSpacing: '-0.04em', color: c.ink, textDecoration: 'none',
        }}>
          DIG
        </Link>
        <Link href="/" className="lg-link lg-tap" style={{
          fontSize: '13.5px', fontWeight: 500, color: c.inkSoft, textDecoration: 'none',
        }}>
          ← Back to site
        </Link>
        <button
          className="lg-tap"
          onClick={() => setBrightness(brightness > 65 ? 10 : 80)}
          style={{
            marginInlineStart: 'auto', padding: '7px 12px', cursor: 'pointer',
            background: 'transparent', border: '1.5px solid ' + c.hairline,
            color: c.inkFaint, fontFamily: SANS, fontSize: '11.5px', fontWeight: 500,
          }}
        >
          {light ? 'Light' : 'Dark'}
        </button>
      </header>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '56px clamp(16px, 4vw, 28px) 80px' }}>
        <p style={{
          margin: '0 0 10px', fontSize: '11.5px', fontWeight: 700,
          letterSpacing: '0.2em', color: c.inkFaint,
        }}>
          {updated}
        </p>
        <h1 style={{
          margin: '0 0 22px', fontFamily: DISPLAY,
          fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800,
          lineHeight: 1.04, letterSpacing: '-0.04em',
        }}>
          {title}
        </h1>

        {intro.map((p, i) => (
          <p key={i} style={{ margin: '0 0 16px', fontSize: '16.5px', lineHeight: 1.7, color: c.inkSoft }}>
            {p}
          </p>
        ))}

        {sections.map((s, i) => (
          <section key={i} style={{ marginTop: '40px' }}>
            <h2 style={{
              margin: '0 0 6px', fontFamily: DISPLAY, fontSize: '22px',
              fontWeight: 700, letterSpacing: '-0.02em', color: c.ink,
            }}>
              {/* Decorative: a screen reader announcing "zero-one, The
                  service" adds nothing, and the number carries no meaning a
                  listener needs. */}
              <span aria-hidden="true" style={{ color: c.cobalt, marginInlineEnd: '10px' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.heading}
            </h2>
            <div style={{ height: '2px', background: c.rule, margin: '0 0 16px' }} />
            {s.body.map((para, j) => (
              <p key={j} style={{ margin: '0 0 14px', fontSize: '15.5px', lineHeight: 1.7, color: c.inkSoft }}>
                {para}
              </p>
            ))}
            {s.list && (
              <ul style={{ margin: '0 0 14px', paddingInlineStart: '20px' }}>
                {s.list.map((item, j) => (
                  <li key={j} style={{ fontSize: '15.5px', lineHeight: 1.7, color: c.inkSoft, marginBottom: '7px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <div style={{
          marginTop: '48px', padding: '16px 18px',
          border: '2px solid ' + c.rule, background: c.lime, color: '#12121a',
        }}>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
            {closing}
          </p>
        </div>

        <p style={{ margin: '28px 0 0', fontSize: '13px', lineHeight: 1.6, color: c.inkFaint }}>
          This page is published in English. Translations of the rest of the site
          are provided for convenience; the English text of this document governs.
        </p>
      </main>

      <footer style={{
        borderTop: '2px solid ' + c.rule, padding: '24px clamp(16px, 3vw, 32px)',
        display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontFamily: DISPLAY, fontSize: '15px', fontWeight: 800, letterSpacing: '-0.04em' }}>DIG</span>
        <Link href="/privacy" className="lg-link lg-tap" style={{ fontSize: '13px', color: c.inkSoft, textDecoration: 'none' }}>Privacy</Link>
        <Link href="/terms" className="lg-link lg-tap" style={{ fontSize: '13px', color: c.inkSoft, textDecoration: 'none' }}>Terms</Link>
        <a href="mailto:dataset_insight_generator.ai@proton.me" className="lg-link lg-tap"
           style={{ fontSize: '13px', color: c.inkSoft, textDecoration: 'none' }}>Contact</a>
        <span style={{ marginInlineStart: 'auto', fontSize: '12.5px', color: c.inkFaint }}>
          datainsightgen.com
        </span>
      </footer>
    </div>
  );
}
