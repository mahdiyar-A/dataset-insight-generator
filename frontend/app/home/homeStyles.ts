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

/* A link to a section lands below the sticky header, not under it. */
section[id] { scroll-margin-top: 72px; }

/* ── The product, under the title ────────────────────────────────────── */
/* Laid on the blue like a sheet of paper, overlapping the fold so the page
   invites a scroll. Its bottom edge is the ticker's top border. */
.hp-win { max-width: 1000px; margin: 0 auto; background: var(--card); color: var(--ink); border: 2px solid #12121a; border-bottom: none; box-shadow: 0 -18px 50px rgba(0,0,0,.28); text-align: start; }
.hp-win-bar { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-bottom: 2px solid var(--rule); background: var(--paper-alt); font-size: 12.5px; color: var(--ink-soft); }
.hp-win-dots { display: flex; gap: 6px; }
.hp-win-dots i { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--rule); background: var(--card); }
.hp-win-dots i:first-child { background: var(--lime); }
.hp-win-file { font-weight: 700; color: var(--ink); }
.hp-win-ready { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border: 1.5px solid #12121a; background: var(--lime); color: #12121a; font-size: 11.5px; font-weight: 800; white-space: nowrap; }
.hp-win-body { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
.hp-win-main { min-width: 0; padding: 14px 20px 0; }
.hp-win-tabs { display: flex; gap: 2px; margin: 0 0 14px; border-bottom: 2px solid var(--hairline); }
.hp-win-tabs span { margin-bottom: -2px; padding: 6px 12px; border-bottom: 2px solid transparent; font-size: 12.5px; font-weight: 700; color: var(--ink-faint); }
.hp-win-tabs .hp-on { color: var(--ink); border-bottom-color: var(--cobalt-accent); }
.hp-win-eyebrow { margin: 0 0 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .16em; color: var(--cobalt-accent); }
.hp-win-title { margin: 0 0 8px; font-family: ${DISPLAY}; font-size: clamp(18px, 2vw, 24px); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; color: var(--ink); }
.hp-win-stat { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 13.5px; line-height: 1.35; color: var(--ink-soft); }
.hp-win-stat strong { font-family: ${DISPLAY}; font-size: 34px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; color: var(--cobalt-accent); white-space: nowrap; }
.hp-win-chart { display: block; width: 100%; height: auto; border: 2px solid var(--rule); border-bottom: none; background: #ffffff; }
.hp-win-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 18px 18px; border-inline-start: 2px solid var(--rule); background: var(--paper-alt); }
.hp-win-q { align-self: flex-end; max-width: 92%; margin: 0; padding: 9px 12px; background: var(--ink); color: var(--paper); font-size: 13.5px; line-height: 1.4; }
.hp-win-a { max-width: 96%; padding: 10px 12px; border: 2px solid var(--rule); background: var(--card); box-shadow: 3px 3px 0 var(--rule); }
.hp-win-a p { margin: 7px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink); }
.hp-win-input { margin: auto 0 0; padding: 10px 12px; border: 2px solid var(--rule); background: var(--card); color: var(--ink-faint); font-size: 13px; }
[dir="rtl"] .hp-win-eyebrow, [dir="rtl"] .hp-win-title, [dir="rtl"] .hp-win-stat strong { letter-spacing: 0; }

/* ── Security ────────────────────────────────────────────────────────── */
.hp-trust { padding: 76px clamp(16px, 3vw, 32px); background: var(--cobalt); color: #ffffff; border-bottom: 2px solid var(--rule); }
.hp-trust .hp-eyebrow { color: #d6f24a; }
.hp-trust .hp-h2 { color: #ffffff; }
.hp-trust .hp-sub { color: rgba(255,255,255,.82); }
.hp-promises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin: 0; padding: 0; list-style: none; }
.hp-promises li { padding: 24px 22px; border: 2px solid #12121a; background: rgba(255,255,255,.08); box-shadow: 6px 6px 0 #12121a; }
.hp-promise-ic { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; margin-bottom: 16px; border: 2px solid #12121a; background: #d6f24a; color: #12121a; }
.hp-promises h3 { margin: 0 0 8px; font-family: ${DISPLAY}; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff; }
.hp-promises p { margin: 0; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,.86); }
[dir="rtl"] .hp-promises h3 { letter-spacing: 0; }
.hp-trust-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; margin: 30px 0 0; font-size: 13.5px; color: rgba(255,255,255,.72); }
.hp-trust-foot a { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #d6f24a; text-decoration: none; }
.hp-trust-foot a:hover { text-decoration: underline; text-underline-offset: 3px; }
[dir="rtl"] .hp-trust-foot svg { transform: scaleX(-1); }

/* ── Questions ───────────────────────────────────────────────────────── */
.hp-faq-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 48px; align-items: start; }
.hp-faq-grid .hp-sub a { color: var(--cobalt-accent); font-weight: 700; }
.hp-faq { display: grid; gap: 10px; }
.hp-faq details { border: 2px solid var(--rule); background: var(--card); transition: box-shadow .15s ease; }
.hp-faq details[open] { box-shadow: 6px 6px 0 var(--cobalt-accent); }
.hp-faq summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; list-style: none; cursor: pointer; font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; color: var(--ink); }
.hp-faq summary::-webkit-details-marker { display: none; }
.hp-faq summary:focus-visible { outline: 3px solid var(--lime); outline-offset: -3px; }
.hp-faq summary svg { color: var(--cobalt-accent); transition: transform .2s ease; }
.hp-faq details[open] summary svg { transform: rotate(180deg); }
.hp-faq details p { margin: 0; padding: 0 18px 18px; font-size: 15px; line-height: 1.6; color: var(--ink-soft); }
[dir="rtl"] .hp-faq summary { letter-spacing: 0; }

/* ── The difference ──────────────────────────────────────────────────── */
.hp-vs-wrap { position: relative; overflow: hidden; padding: clamp(80px, 10vw, 128px) clamp(16px, 3vw, 32px); background: #12121a; color: #f2efe9; border-bottom: 2px solid var(--rule); }
.hp-vs-wrap::before { content: ''; position: absolute; inset: -40% -10% auto auto; width: 720px; height: 720px; background: radial-gradient(closest-side, rgba(37,54,224,.55), rgba(37,54,224,0)); pointer-events: none; }
.hp-vs-wrap .hp-in { position: relative; }
.hp-vs-wrap .hp-eyebrow { color: #d6f24a; }
.hp-vs-head { max-width: 15ch; margin: 0 0 20px; font-family: ${DISPLAY}; font-size: clamp(44px, 7.4vw, 96px); font-weight: 800; line-height: .98; letter-spacing: -0.05em; color: #ffffff; text-wrap: balance; }
.hp-vs-head em { font-style: normal; color: #d6f24a; }
.hp-vs-wrap .hp-sub { max-width: 56ch; margin-bottom: 56px; font-size: 17.5px; color: rgba(242,239,233,.8); }
.hp-pillars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; margin: 0; padding: 0; list-style: none; background: rgba(242,239,233,.14); border: 2px solid rgba(242,239,233,.14); }
.hp-pillars li { padding: clamp(26px, 3.4vw, 44px); background: #12121a; transition: background .25s ease; }
.hp-pillars li:hover { background: #171a2e; }
.hp-pillars b { display: block; margin-bottom: 18px; font-family: ${DISPLAY}; font-size: 15px; font-weight: 800; letter-spacing: .08em; color: #d6f24a; }
.hp-pillars h3 { margin: 0 0 12px; font-family: ${DISPLAY}; font-size: clamp(26px, 3vw, 38px); font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; color: #ffffff; }
.hp-pillars p { margin: 0; max-width: 44ch; font-size: 16px; line-height: 1.6; color: rgba(242,239,233,.72); }
[dir="rtl"] .hp-vs-head, [dir="rtl"] .hp-pillars h3 { letter-spacing: 0; line-height: 1.3; }
@media (max-width: 759px) {
  .hp-pillars { grid-template-columns: minmax(0, 1fr); }
  .hp-vs-wrap::before { width: 420px; height: 420px; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-pillars li { transition: none !important; }
}

/* ── The founder ─────────────────────────────────────────────────────── */
.hp-founder { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 56px; align-items: start; }
.hp-founder-card { padding: 20px; border: 2px solid var(--rule); background: var(--card); box-shadow: 8px 8px 0 var(--cobalt-accent); }
.hp-founder-mono { display: grid; place-items: center; aspect-ratio: 1; border: 2px solid #12121a; background: var(--lime); color: #12121a; font-family: ${DISPLAY}; font-size: 64px; font-weight: 800; letter-spacing: -0.05em; }
.hp-founder-who strong { display: block; margin: 16px 0 4px; font-family: ${DISPLAY}; font-size: 18px; font-weight: 700; color: var(--ink); }
.hp-founder-who > span { display: block; font-size: 13.5px; line-height: 1.45; color: var(--ink-soft); }
.hp-founder-in { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 14px; font-weight: 700; color: var(--ink); text-decoration: none; --icon-cut: var(--card); }
.hp-founder-in:hover { color: var(--cobalt-accent); }
.hp-quote { margin: 0 0 24px; padding: 0; font-family: ${DISPLAY}; font-size: clamp(21px, 2.3vw, 28px); font-weight: 600; line-height: 1.38; letter-spacing: -0.015em; color: var(--ink); }
.hp-quote p { margin: 0; }
.hp-quote p::before { content: '“'; color: var(--cobalt-accent); }
.hp-quote p::after { content: '”'; color: var(--cobalt-accent); }
[dir="rtl"] .hp-quote p::before { content: '«'; }
[dir="rtl"] .hp-quote p::after { content: '»'; }
[dir="rtl"] .hp-quote { letter-spacing: 0; line-height: 1.8; }
.hp-founder-origin { margin: 0; max-width: 62ch; font-size: 15.5px; line-height: 1.6; color: var(--ink-soft); }
@media (max-width: 759px) {
  .hp-founder { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .hp-founder-card { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 16px; align-items: center; order: 2; }
  .hp-founder-mono { font-size: 34px; }
  .hp-founder-who strong { margin-top: 0; }
  .hp-founder-in { margin-top: 8px; }
}

/* ── The last word ───────────────────────────────────────────────────── */
.hp-close { padding: 84px clamp(16px, 3vw, 32px); background: var(--lime); color: #12121a; border-bottom: 2px solid #12121a; text-align: center; }
.hp-close .hp-h2 { max-width: 22ch; margin: 0 auto 14px; color: #12121a; font-size: clamp(32px, 4.6vw, 54px); font-weight: 800; }
.hp-close-sub { max-width: 52ch; margin: 0 auto 30px; font-size: 16.5px; line-height: 1.55; color: #3c3a34; }
.hp-close-btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.hp-close-btns .hp-btn { gap: 10px; }
.hp-close .hp-ink { background: #12121a; color: #f2efe9; border-color: #12121a; }
.hp-close .hp-ink:hover { box-shadow: 4px 4px 0 #2536e0; }
.hp-paper { background: #ffffff; color: #12121a; }
.hp-close-mail { margin: 22px 0 0; font-size: 14.5px; color: #3c3a34; }
.hp-close-mail a { font-weight: 700; color: #12121a; text-underline-offset: 3px; }

/* ── Footer ──────────────────────────────────────────────────────────── */
.hp-foot { padding: 56px clamp(16px, 3vw, 32px) 26px; background: var(--paper); color: var(--ink); }
.hp-foot-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) repeat(4, minmax(0, 1fr)); gap: 32px; }
.hp-foot-logo { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); text-decoration: none; }
.hp-foot-logo img { height: 34px; width: auto; }
.hp-foot-logo span { font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; letter-spacing: -0.04em; }
.hp-foot-brand p { max-width: 32ch; margin: 12px 0 16px; font-size: 14px; line-height: 1.55; color: var(--ink-soft); }
.hp-foot-social { display: inline-flex; color: var(--ink); --icon-cut: var(--paper); transition: color .15s ease; }
.hp-foot-social:hover { color: var(--cobalt-accent); }
.hp-foot nav { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.hp-foot nav p { margin: 0 0 4px; font-size: 11.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-faint); }
[dir="rtl"] .hp-foot nav p { letter-spacing: 0; }
.hp-foot nav a { font-size: 14px; color: var(--ink-soft); text-decoration: none; }
.hp-foot nav a:hover { color: var(--cobalt-accent); }
.hp-foot-founder { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0 5px; --icon-cut: var(--paper); }
.hp-foot-founder span { color: var(--ink-faint); }
.hp-foot-base { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--rule); font-size: 12.5px; color: var(--ink-faint); }

@media (max-width: 899px) {
  .hp-faq-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .hp-foot-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hp-foot-brand { grid-column: 1 / -1; }
}
@media (max-width: 699px) {
  .hp-foot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 20px; }
}
@media (max-width: 759px) {
  .hp-win-body { grid-template-columns: minmax(0, 1fr); }
  .hp-win-side { display: none; }
  .hp-promises { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 519px) {
  .hp-win-main { padding: 12px 14px 0; }
  .hp-win-tabs span { padding: 6px 9px; }
  .hp-win-stat strong { font-size: 28px; }
  .hp-foot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 20px; }
  .hp-close-btns .hp-btn { flex: 1 1 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-faq details, .hp-faq summary svg { transition: none !important; }
}
`;
