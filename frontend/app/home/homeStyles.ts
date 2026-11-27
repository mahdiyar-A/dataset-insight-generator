import { DISPLAY } from './atlas';

/**
 * Styles for the landing page's proof, files and pricing sections. Every class
 * starts with `hp-`, and every colour is a theme token (globals.css, ATLAS), so
 * the sections follow Light and Dark like the rest of the page.
 */
export const HOME_CSS = `
.hp-section { padding: 76px clamp(16px, 3vw, 32px); border-bottom: 2px solid var(--rule); background: var(--paper); color: var(--ink); }
.hp-section.hp-alt { background: var(--paper-alt); }
.hp-in { max-width: 1120px; margin: 0 auto; }
.hp-eyebrow { margin: 0 0 10px; font-size: 11.5px; font-weight: 700; letter-spacing: .2em; color: var(--ink-faint); }
.hp-h2 { margin: 0 0 14px; max-width: 20ch; font-family: ${DISPLAY}; font-size: clamp(30px, 4vw, 46px); font-weight: 700; line-height: 1.06; letter-spacing: -0.035em; color: var(--ink); text-wrap: balance; }
.hp-sub { margin: 0 0 40px; max-width: 62ch; font-size: 16px; line-height: 1.6; color: var(--ink-soft); }
[dir="rtl"] .hp-eyebrow, [dir="rtl"] .hp-h2 { letter-spacing: 0; }
[dir="rtl"] .hp-h2 { line-height: 1.3; }

.hp-btn {
  display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px;
  border: 2px solid #12121a; font-family: ${DISPLAY}; font-size: 15px; font-weight: 700; text-align: center;
  text-decoration: none; transition: transform .12s ease, box-shadow .12s ease;
}
.hp-btn:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 #12121a; }
.hp-btn:active { transform: none; box-shadow: none; }
.hp-lime { background: var(--lime); color: #12121a; }
.hp-ink { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.hp-ink:hover { box-shadow: 4px 4px 0 var(--cobalt-accent); }

/* ── Before and after ────────────────────────────────────────────────── */
.hp-split { display: grid; grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1fr); align-items: stretch; }
.hp-arrow { display: flex; align-items: center; justify-content: center; color: var(--ink); }
[dir="rtl"] .hp-arrow svg { transform: scaleX(-1); }
.hp-panel { display: flex; flex-direction: column; min-width: 0; border: 2px solid var(--rule); background: var(--card); box-shadow: 8px 8px 0 var(--hairline); }
.hp-panel.hp-after { box-shadow: 8px 8px 0 var(--cobalt-accent); }
.hp-bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0; padding: 10px 14px; border-bottom: 2px solid var(--rule); background: var(--paper-alt); font-size: 13px; color: var(--ink-soft); }
.hp-bar strong { font-size: 11px; font-weight: 800; letter-spacing: .16em; color: var(--ink); }
.hp-bar-end { margin-inline-start: auto; }
.hp-after .hp-bar { background: var(--lime); color: #12121a; }
.hp-after .hp-bar strong { color: #12121a; }

.hp-tablewrap { flex: 1; overflow-x: auto; padding: 6px 0; }
.hp-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.hp-table th { padding: 8px 10px; text-align: left; font-weight: 700; color: var(--ink); white-space: nowrap; }
.hp-table td { padding: 11px 10px; text-align: left; border-top: 1px solid var(--hairline); color: var(--ink-soft); white-space: nowrap; }
.hp-table .hp-rown { padding-inline-start: 14px; color: var(--ink-faint); font-weight: 500; }
.hp-table tr.hp-dup td { background: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--ink); }
.hp-bad { padding: 2px 7px; font-weight: 700; color: var(--ink); background: transparent; border: 1.5px dashed currentColor; }
tr.hp-blank .hp-bad { border-color: var(--cobalt-accent); background: color-mix(in srgb, var(--cobalt-accent) 18%, transparent); }
tr.hp-neg .hp-bad { border-style: solid; border-color: var(--danger); background: color-mix(in srgb, var(--danger) 22%, transparent); }
.hp-problems { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; padding: 12px 14px; list-style: none; border-top: 2px solid var(--rule); font-size: 13.5px; color: var(--ink-soft); }
.hp-problems li { display: flex; align-items: baseline; gap: 7px; }
.hp-problems strong { font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
.hp-problems i { width: 11px; height: 11px; flex-shrink: 0; background: var(--warn); }
.hp-problems .hp-blank i { background: var(--cobalt-accent); }
.hp-problems .hp-neg i { background: var(--danger); }

.hp-after-in { flex: 1; display: flex; flex-direction: column; padding: 18px 18px 16px; }
.hp-finding { margin: 0 0 8px; font-family: ${DISPLAY}; font-size: clamp(20px, 2.2vw, 25px); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; color: var(--ink); }
.hp-figure { display: flex; align-items: center; gap: 14px; margin: 0 0 16px; font-size: 14px; line-height: 1.4; color: var(--ink-soft); }
.hp-share {
  padding: 0 4px; border: none; border-bottom: 3px dashed var(--cobalt-accent); background: none; cursor: pointer; white-space: nowrap;
  font-family: ${DISPLAY}; font-size: clamp(44px, 5vw, 60px); font-weight: 800; line-height: 1.05; letter-spacing: -0.05em; color: var(--cobalt-accent);
}
.hp-share:hover { background: var(--lime); color: #12121a; border-bottom-color: #12121a; }
[dir="rtl"] .hp-finding, [dir="rtl"] .hp-share { letter-spacing: 0; }
.hp-charttitle { margin: auto 0 8px; font-size: 12.5px; font-weight: 700; color: var(--ink); }
.hp-bars { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.hp-bars li { display: grid; grid-template-columns: 84px minmax(0, 1fr) 78px; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-soft); }
.hp-bars li:hover .hp-val, .hp-bars li:hover .hp-bar-name { color: var(--ink); font-weight: 700; }
.hp-track { display: block; height: 18px; border-inline-start: 1px solid var(--line); }
.hp-fill { display: block; height: 100%; background: color-mix(in srgb, var(--ink-faint) 78%, var(--card)); transform-origin: left; }
.hp-fill.hp-most { background: var(--cobalt-accent); }
.hp-val { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); }
/* The bars grow in with their panel, and only when the page is animating it. */
.rv-armed [data-rv] .hp-fill { transform: scaleX(0); transition: transform .7s cubic-bezier(.16,1,.3,1); }
.rv-armed [data-rv].rv-in .hp-fill { transform: none; }

/* ── Press one ───────────────────────────────────────────────────────── */
.hp-try { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1fr); margin-top: 34px; border: 2px solid var(--rule); background: var(--paper-alt); }
.hp-asks { display: flex; flex-direction: column; gap: 10px; padding: clamp(18px, 2.6vw, 28px); border-inline-end: 2px solid var(--rule); }
.hp-trytitle { margin: 0 0 6px; font-family: ${DISPLAY}; font-size: 21px; font-weight: 800; line-height: 1.2; letter-spacing: -0.025em; color: var(--ink); }
[dir="rtl"] .hp-trytitle { letter-spacing: 0; }
.hp-asks button {
  min-height: 52px; padding: 10px 16px; border: 2px solid var(--rule); background: var(--card); color: var(--ink);
  font: inherit; font-size: 15px; font-weight: 600; line-height: 1.3; text-align: start; cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, background-color .2s ease;
}
.hp-asks button:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--rule); }
.hp-asks button[aria-pressed="true"] { background: var(--cobalt); color: #ffffff; box-shadow: 4px 4px 0 var(--lime); }
.hp-reply { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: end; gap: 16px 22px; padding: clamp(18px, 2.6vw, 28px); }
.hp-dig { display: block; width: 88px; }
.hp-dig svg { display: block; width: 88px; height: 130px; }
[dir="rtl"] .hp-dig { transform: scaleX(-1); }
.hp-bubble { position: relative; align-self: center; min-height: 148px; padding: 16px 18px; border: 2px solid var(--rule); background: var(--card); box-shadow: 4px 4px 0 var(--rule); }
.hp-bubble::before { content: ''; position: absolute; inset-inline-start: -9px; bottom: 26px; width: 14px; height: 14px; background: var(--card); border: solid var(--rule); border-width: 0 0 2px 2px; transform: rotate(45deg); }
[dir="rtl"] .hp-bubble::before { border-width: 2px 2px 0 0; }
.hp-bubble-in { animation: hpIn .3s ease backwards; }
.hp-bubble p { margin: 10px 0 0; font-size: 15.5px; line-height: 1.55; color: var(--ink); }
.hp-bubble .hp-sum { font-size: 13.5px; font-variant-numeric: tabular-nums; color: var(--ink-soft); }
.hp-badge { display: inline-block; padding: 3px 8px; border: 1.5px solid currentColor; font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ok-text); }
.hp-badge.hp-worked { color: var(--cobalt-accent); }
.hp-badge.hp-refused { color: var(--warn-text); }
[dir="rtl"] .hp-badge { letter-spacing: 0; }
.hp-reply > .hp-btn { grid-column: 1 / -1; justify-self: start; }

/* DIG breathes, hops when it has looked something up, and shakes its head. */
.hp-dig .dg-body { transform-origin: 25px 76px; }
.hp-dig .dg-mood-point .dg-body { animation: hpLean 1.8s ease-in-out infinite; }
.hp-dig .dg-mood-cheer .dg-body { animation: hpHop .6s cubic-bezier(.34,1.56,.64,1) 2; }
.hp-dig .dg-mood-no .dg-head { animation: hpNo .5s ease 2; transform-origin: 24px 32px; }
.hp-dig .dg-eyes { transform-origin: 24px 21px; animation: hpBlink 4.4s infinite; }
@keyframes hpIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes hpLean { 0%, 100% { transform: rotate(3deg); } 50% { transform: rotate(6deg); } }
@keyframes hpHop { 0%, 100% { transform: none; } 35% { transform: translateY(-10px) rotate(-6deg); } 65% { transform: translateY(-4px) rotate(5deg); } }
@keyframes hpNo { 0%, 100% { transform: none; } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
@keyframes hpBlink { 0%, 93%, 100% { transform: none; } 96% { transform: scaleY(.1); } }

/* ── The files ───────────────────────────────────────────────────────── */
.hp-files { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
.hp-file { display: flex; flex-direction: column; min-width: 0; border: 2px solid var(--rule); background: var(--card); color: var(--ink); text-decoration: none; }
/* Only the top of a page shows; the slide is wider than it is tall, so it fits whole. */
.hp-shot { display: block; height: 300px; overflow: hidden; padding: 20px 20px 0; background: var(--cobalt); border-bottom: 2px solid var(--rule); }
.hp-shot img { display: block; width: 100%; height: auto; border: 2px solid #12121a; box-shadow: 6px 6px 0 rgba(18,18,26,.55); transition: transform .35s cubic-bezier(.16,1,.3,1); }
.hp-file-docx .hp-shot { background: var(--lime); }
.hp-file-pptx .hp-shot { display: flex; align-items: center; padding: 20px; background: #e4572e; }
.hp-file:hover .hp-shot img { transform: translateY(-8px); }
.hp-file-text { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 18px; font-size: 14px; line-height: 1.45; color: var(--ink-soft); }
.hp-file-head { display: flex; align-items: center; gap: 10px; }
.hp-file-head strong { font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
.hp-tag { padding: 2px 8px; border: 1.5px solid var(--line); font-size: 11.5px; font-weight: 700; color: var(--ink-soft); }
.hp-tag-pro { background: var(--lime); color: #12121a; border-color: #12121a; }
.hp-file-go { margin-top: 4px; font-weight: 700; color: var(--cobalt-accent); }
.hp-file:hover .hp-file-go { text-decoration: underline; text-underline-offset: 3px; }
.hp-csv { margin: 22px 0 0; font-size: 14.5px; color: var(--ink-soft); }
.hp-csv a { font-weight: 700; color: var(--cobalt-accent); }

/* ── The plans ───────────────────────────────────────────────────────── */
.hp-plans { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 26px; align-items: stretch; }
.hp-plan { display: flex; flex-direction: column; padding: clamp(22px, 3vw, 34px); border: 2px solid var(--rule); background: var(--card); color: var(--ink); }
.hp-plan h3 { margin: 0; font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.hp-price { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 6px 0 18px; font-size: 15px; color: var(--ink-soft); }
.hp-price strong { font-family: ${DISPLAY}; font-size: clamp(44px, 5vw, 60px); font-weight: 800; line-height: 1; letter-spacing: -0.05em; color: var(--ink); }
[dir="rtl"] .hp-price strong, [dir="rtl"] .hp-plan h3 { letter-spacing: 0; }
.hp-lead { margin: 0 0 12px; padding-top: 16px; border-top: 2px solid var(--rule); font-size: 14px; font-weight: 700; }
.hp-plan ul { display: grid; gap: 10px; margin: 0 0 26px; padding: 0; list-style: none; }
.hp-plan li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.45; }
.hp-plan li svg { margin-top: 4px; color: var(--ok-text); }
.hp-plan .hp-btn { margin-top: auto; }
.hp-plan-pro { background: var(--cobalt); color: #ffffff; border-color: #12121a; box-shadow: 10px 10px 0 var(--lime); }
.hp-plan-pro .hp-price, .hp-plan-pro .hp-price strong { color: #ffffff; }
.hp-plan-pro .hp-lead { border-color: rgba(255,255,255,.4); }
.hp-plan-pro li svg { color: var(--lime); }
.hp-paynote { margin: 30px 0 0; font-size: 13.5px; color: var(--ink-faint); }

@media (max-width: 899px) {
  .hp-split { grid-template-columns: minmax(0, 1fr); }
  .hp-arrow { padding: 14px 0; }
  .hp-arrow svg, [dir="rtl"] .hp-arrow svg { transform: rotate(90deg); }
  .hp-try { grid-template-columns: minmax(0, 1fr); }
  .hp-asks { border-inline-end: none; border-bottom: 2px solid var(--rule); }
}
@media (max-width: 759px) {
  .hp-files, .hp-plans { grid-template-columns: minmax(0, 1fr); }
  .hp-shot { height: 250px; }
  .hp-file-pptx .hp-shot { height: auto; }
  .hp-plan-pro { box-shadow: 6px 6px 0 var(--lime); }
}
@media (max-width: 519px) {
  .hp-table { font-size: 11px; }
  .hp-table th, .hp-table td { padding-inline: 6px; }
  .hp-table .hp-c-date, .hp-table .hp-rown { display: none; }
  .hp-table .hp-c-store { padding-inline-start: 12px; }
  .hp-reply { grid-template-columns: minmax(0, 1fr); }
  .hp-dig { width: 60px; }
  .hp-dig svg { width: 60px; height: 89px; }
  .hp-bubble { order: -1; min-height: 0; }
  .hp-bubble::before { inset-inline-start: 22px; bottom: -9px; border-width: 0 2px 2px 0; }
  [dir="rtl"] .hp-bubble::before { border-width: 0 2px 2px 0; }
  .hp-reply > .hp-btn { justify-self: stretch; }
  .hp-bars li { grid-template-columns: 74px minmax(0, 1fr) 72px; gap: 8px; font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-dig *, .hp-bubble-in { animation: none !important; }
  .hp-shot img, .hp-btn, .hp-asks button { transition: none !important; }
}
`;
