import { DISPLAY } from './atlas';

/**
 * The file-problem pages (UseCasePage). They use the homepage's classes for
 * sections, headings, buttons, questions and the footer; these are only the
 * parts the homepage has no version of: a plain top bar, a text-led title,
 * the cards, the numbered steps and the links to the other pages.
 */
export const USE_CASE_CSS = `
.uc-page { min-height: 100vh; background: var(--paper); color: var(--ink); font-family: var(--app-sans); overflow-x: clip; }

.uc-bar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 18px; min-height: 62px; padding: 10px clamp(16px, 3vw, 32px); background: var(--paper); border-bottom: 2px solid var(--rule); }
.uc-logo { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); text-decoration: none; }
.uc-logo img { height: 30px; width: auto; }
.uc-logo span { font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; letter-spacing: -0.04em; }
.uc-nav { display: flex; align-items: center; gap: 20px; margin-inline-start: auto; }
.uc-nav a { font-size: 14px; font-weight: 500; color: var(--ink-soft); text-decoration: none; }
.uc-nav a:hover { color: var(--cobalt-accent); }
.uc-bar .hp-btn { min-height: 40px; padding: 0 16px; font-size: 14px; }

.uc-hero { padding: clamp(56px, 9vw, 104px) clamp(16px, 3vw, 32px) clamp(48px, 7vw, 84px); border-bottom: 2px solid var(--rule); }
.uc-h1 { margin: 0 0 18px; max-width: 18ch; font-family: ${DISPLAY}; font-size: clamp(38px, 6vw, 72px); font-weight: 800; line-height: 1.02; letter-spacing: -0.045em; color: var(--ink); text-wrap: balance; }
.uc-lead { margin: 0 0 30px; max-width: 58ch; font-size: clamp(16.5px, 1.6vw, 19px); line-height: 1.6; color: var(--ink-soft); }
.uc-btns { display: flex; flex-wrap: wrap; gap: 12px; }
.uc-btns .hp-btn { gap: 10px; }
.uc-ghost { background: transparent; color: var(--ink); border-color: var(--rule); }
.uc-ghost:hover { box-shadow: 4px 4px 0 var(--cobalt-accent); }
.uc-fine { margin: 16px 0 0; font-size: 13.5px; color: var(--ink-faint); }
.uc-exts { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 0; padding: 0; list-style: none; }
.uc-exts li { padding: 5px 10px; border: 2px solid var(--rule); background: var(--card); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; font-weight: 700; }

.uc-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.uc-cards li { padding: 22px 20px; border: 2px solid var(--rule); background: var(--card); box-shadow: 6px 6px 0 var(--rule); }
.uc-cards svg { color: var(--cobalt-accent); }
.uc-cards h3 { margin: 12px 0 8px; font-family: ${DISPLAY}; font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--ink); }
.uc-cards p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-soft); }

.uc-shot { max-width: 1040px; }
.uc-shot-foot { margin: 22px 0 0; font-size: 15px; }
.uc-shot-foot a { display: inline-flex; align-items: center; gap: 8px; color: var(--cobalt-accent); font-weight: 700; text-decoration: none; }
.uc-shot-foot a:hover { text-decoration: underline; text-underline-offset: 3px; }

.uc-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; counter-reset: uc; border: 2px solid var(--rule); background: var(--card); }
.uc-steps li { padding: 24px 22px; counter-increment: uc; border-inline-start: 2px solid var(--rule); }
.uc-steps li:first-child { border-inline-start: 0; }
.uc-steps li::before { content: counter(uc, decimal-leading-zero); display: block; margin-bottom: 14px; font-family: ${DISPLAY}; font-size: 30px; font-weight: 800; line-height: 1; color: var(--cobalt-accent); }
.uc-steps h3 { margin: 0 0 6px; font-family: ${DISPLAY}; font-size: 17.5px; font-weight: 700; color: var(--ink); }
.uc-steps p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-soft); }

.uc-limits { display: grid; gap: 14px; margin: 8px 0 0; padding: 0; list-style: none; }
.uc-limits li { display: flex; gap: 10px; font-size: 15px; line-height: 1.55; color: var(--ink-soft); }
.uc-limits svg { margin-top: 4px; color: var(--cobalt-accent); }

.uc-more { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.uc-more a { display: block; padding: 20px; border: 2px solid var(--rule); background: var(--card); color: var(--ink); text-decoration: none; transition: transform .12s ease, box-shadow .12s ease; }
.uc-more a:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--cobalt-accent); }
.uc-more small { display: block; margin-bottom: 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .16em; color: var(--ink-faint); }
.uc-more strong { font-family: ${DISPLAY}; font-size: 18px; font-weight: 700; line-height: 1.25; }

@media (max-width: 999px) {
  .uc-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 899px) {
  .uc-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .uc-steps li:nth-child(3) { border-inline-start: 0; }
  .uc-steps li:nth-child(n+3) { border-top: 2px solid var(--rule); }
}
@media (max-width: 759px) {
  .uc-more { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 559px) {
  .uc-cards { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 519px) {
  .uc-nav .uc-wide { display: none; }
  .uc-logo span { display: none; }
  .uc-steps { grid-template-columns: minmax(0, 1fr); }
  .uc-steps li { border-inline-start: 0; }
  .uc-steps li + li { border-top: 2px solid var(--rule); }
  .uc-btns .hp-btn { flex: 1 1 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .uc-more a { transition: none !important; }
}
`;
