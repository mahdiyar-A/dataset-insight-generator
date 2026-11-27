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
.hp-problems { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 12px 14px; border-top: 2px solid var(--rule); }
.hp-problems p { flex-basis: 100%; margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
[dir="rtl"] .hp-problems p { letter-spacing: 0; }
.hp-problems button { display: inline-flex; align-items: baseline; gap: 7px; padding: 6px 11px; border: 2px solid var(--rule); background: var(--card); color: var(--ink-soft); font: inherit; font-size: 13.5px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, background-color .15s ease; }
.hp-problems button:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--rule); color: var(--ink); }
.hp-problems button[aria-pressed="true"] { background: var(--ink); color: var(--paper); box-shadow: 4px 4px 0 var(--lime); }
.hp-problems button[aria-pressed="true"] strong { color: var(--paper); }
.hp-problems strong { font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
.hp-problems i { width: 11px; height: 11px; flex-shrink: 0; align-self: center; background: var(--warn); }
.hp-problems .hp-blank i, .hp-notes .hp-blank i { background: var(--cobalt-accent); }
.hp-problems .hp-neg i, .hp-notes .hp-neg i { background: var(--danger); }
.hp-table tr { transition: opacity .2s ease; }
.hp-table tr.hp-dim { opacity: .28; }
.hp-table tr.hp-lit td { animation: hpLit 1.1s ease 2; }
@keyframes hpLit { 0%, 100% { box-shadow: none; } 50% { box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--lime) 45%, transparent); } }

/* DIG asks before it cleans. */
.hp-ask { flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 14px; padding: 22px 22px 24px; }
.hp-ask p { margin: 0; max-width: 34ch; font-family: ${DISPLAY}; font-size: clamp(19px, 2vw, 23px); font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: var(--ink); }
[dir="rtl"] .hp-ask p { letter-spacing: 0; line-height: 1.6; }
.hp-ask .hp-btn { gap: 9px; cursor: pointer; }
.hp-dig-small { width: 66px; }
.hp-dig-small svg { width: 66px; height: 96px; }
.hp-clean-in { flex: 1; display: flex; flex-direction: column; animation: hpIn .3s ease backwards; }
.hp-clean-in tbody tr { animation: hpIn .35s ease backwards; }
.hp-table tr.hp-gone td { color: var(--ink-faint); text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); }
.hp-good { padding: 2px 7px; font-weight: 800; color: var(--ink); background: color-mix(in srgb, var(--ok-text) 18%, transparent); border: 1.5px solid var(--ok-text); }
.hp-notes { display: grid; gap: 6px; margin: 0; padding: 10px 14px; list-style: none; border-top: 1px solid var(--hairline); font-size: 13px; color: var(--ink-soft); }
.hp-notes li { display: flex; align-items: center; gap: 8px; }
.hp-notes i { width: 10px; height: 10px; flex-shrink: 0; background: var(--warn); }
.hp-done { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 12px 14px; list-style: none; border-top: 2px solid var(--rule); font-size: 13.5px; color: var(--ink-soft); }
.hp-done li { display: inline-flex; align-items: baseline; gap: 6px; }
.hp-done svg { align-self: center; color: var(--ok-text); }
.hp-done strong { font-family: ${DISPLAY}; font-size: 18px; font-weight: 800; color: var(--ink); }
.hp-clean-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; margin-top: auto; padding: 10px 14px 14px; }
.hp-dl { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--cobalt-accent); text-decoration: none; }
.hp-dl:hover { text-decoration: underline; text-underline-offset: 3px; }
.hp-again { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1.5px solid var(--line); background: none; color: var(--ink-soft); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.hp-again:hover { color: var(--ink); border-color: var(--rule); }

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
.hp-reply > .hp-btn { grid-column: 1 / -1; justify-self: start; gap: 9px; }
[dir="rtl"] .hp-reply > .hp-btn svg { transform: scaleX(-1); }

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
.hp-file-pptx .hp-shot { display: flex; align-items: center; padding: 20px; background: var(--red); }
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
.hp-plan-free { box-shadow: 10px 10px 0 var(--red); }
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
}
@media (prefers-reduced-motion: reduce) {
  .hp-dig *, .hp-bubble-in { animation: none !important; }
  .hp-shot img, .hp-btn, .hp-asks button { transition: none !important; }
}

/* A link to a section lands below the sticky header, not under it. */
section[id] { scroll-margin-top: 72px; }

/* ── The product, under the title ────────────────────────────────────── */
/* Laid on the blue like a sheet of paper, overlapping the fold so the page
   invites a scroll. Its bottom edge is the ticker's top border. Everything in
   it that looks pressable is. */
.hp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.hp-win { position: relative; max-width: 1000px; margin: 0 auto; background: var(--card); color: var(--ink); border: 2px solid #12121a; border-bottom: none; box-shadow: 0 -18px 50px rgba(0,0,0,.28); text-align: start; transition: max-width .35s cubic-bezier(.16,1,.3,1); }
.hp-win-big { max-width: 1120px; }
.hp-win button { font: inherit; cursor: pointer; }
.hp-win-bar { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-bottom: 2px solid var(--rule); background: var(--paper-alt); font-size: 12.5px; color: var(--ink-soft); }
.hp-win-dots { display: flex; gap: 7px; }
.hp-win-dots button { display: grid; place-items: center; width: 14px; height: 14px; padding: 0; border-radius: 50%; border: 1.5px solid var(--rule); background: var(--card); color: transparent; transition: transform .15s ease, background-color .15s ease; }
.hp-win-dots button:first-child { background: var(--red); }
.hp-win-dots button:nth-child(2) { background: var(--lime); }
.hp-win-dots svg { width: 8px; height: 8px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.hp-win-dots:hover button, .hp-win-dots button:focus-visible { color: #12121a; }
.hp-win-dots button:hover { transform: scale(1.25); }
.hp-win-dots button[aria-pressed="true"] { background: var(--cobalt-accent); color: #ffffff; }
.hp-win-file { font-weight: 700; color: var(--ink); }
.hp-win-filesbox { position: relative; margin-inline-start: auto; }
.hp-win-ready { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border: 1.5px solid #12121a; background: var(--lime); color: #12121a; font-size: 11.5px !important; font-weight: 800; white-space: nowrap; transition: transform .12s ease, box-shadow .12s ease; }
.hp-win-ready:hover, .hp-win-ready[aria-expanded="true"] { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 #12121a; }
.hp-win-ready[aria-expanded="true"] svg:last-child { transform: rotate(180deg); }
.hp-win-files { position: absolute; z-index: 6; top: calc(100% + 8px); inset-inline-end: 0; width: 280px; padding: 8px; border: 2px solid #12121a; background: var(--card); box-shadow: 6px 6px 0 #12121a; animation: hpIn .2s ease backwards; }
.hp-win-files p { margin: 2px 6px 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.hp-win[dir="rtl"] .hp-win-files p { letter-spacing: 0; }
.hp-win-files a { display: flex; align-items: center; gap: 8px; padding: 9px 8px; color: var(--ink); text-decoration: none; font-size: 13.5px; font-weight: 600; }
.hp-win-files a:hover, .hp-win-files a:focus-visible { background: var(--paper-alt); color: var(--cobalt-accent); }
.hp-win-files em { padding: 1px 6px; border: 1.5px solid #12121a; background: var(--lime); color: #12121a; font-size: 10.5px; font-style: normal; font-weight: 800; }
.hp-win-files small { margin-inline-start: auto; font-size: 11.5px; color: var(--ink-faint); }

.hp-win-body { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
.hp-win-body.hp-win-solo { grid-template-columns: minmax(0, 1fr); }
.hp-win-main { min-width: 0; padding: 14px 20px 0; }
.hp-win-tabs { display: flex; gap: 2px; margin: 0 0 14px; border-bottom: 2px solid var(--hairline); }
.hp-win-tabs button { margin-bottom: -2px; padding: 7px 13px; border: none; border-bottom: 2px solid transparent; background: none; font-size: 12.5px; font-weight: 700; color: var(--ink-faint); transition: color .15s ease, background-color .15s ease; }
.hp-win-tabs button:hover { color: var(--ink); background: var(--paper-alt); }
.hp-win-tabs .hp-on { color: var(--ink); border-bottom-color: var(--cobalt-accent); }
.hp-win-pane { animation: hpIn .25s ease backwards; }
.hp-win-step { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 6px; }
.hp-win-eyebrow { margin: 0; font-size: 10.5px; font-weight: 800; letter-spacing: .16em; color: var(--cobalt-accent); }
.hp-win-side > .hp-win-eyebrow { margin-bottom: 2px; }
.hp-win-arrows { display: flex; gap: 6px; }
.hp-win-arrows button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 2px solid var(--rule); background: var(--card); color: var(--ink); transition: transform .12s ease, box-shadow .12s ease, background-color .15s ease; }
.hp-win-arrows button:first-child svg { transform: scaleX(-1); }
.hp-win[dir="rtl"] .hp-win-arrows button:first-child svg { transform: none; }
.hp-win[dir="rtl"] .hp-win-arrows button:last-child svg { transform: scaleX(-1); }
.hp-win-arrows button:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--rule); background: var(--lime); color: #12121a; }
.hp-win-swap { animation: hpIn .3s ease backwards; }
.hp-win-title { margin: 0 0 8px; font-family: ${DISPLAY}; font-size: clamp(18px, 2vw, 24px); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; color: var(--ink); }
.hp-win-stat { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 13.5px; line-height: 1.35; color: var(--ink-soft); }
.hp-win-stat strong { font-family: ${DISPLAY}; font-size: 34px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; color: var(--cobalt-accent); white-space: nowrap; }
.hp-win-chart { display: block; width: 100%; height: auto; border: 2px solid var(--rule); border-bottom: none; background: #ffffff; }
.hp-win-pager { display: flex; justify-content: center; gap: 8px; padding: 10px 0 12px; }
.hp-win-pager button { width: 26px; height: 6px; padding: 0; border: 1.5px solid var(--rule); background: var(--card); transition: background-color .15s ease, width .2s ease; }
.hp-win-pager button:hover { background: var(--lime); }
.hp-win-pager button[aria-current="true"] { width: 40px; background: var(--cobalt-accent); border-color: var(--cobalt-accent); }

.hp-win-charts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-bottom: 16px; }
.hp-win-charts button { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 2px solid var(--rule); background: var(--card); color: var(--ink); text-align: start; font-size: 11.5px; font-weight: 700; line-height: 1.3; transition: transform .12s ease, box-shadow .12s ease; }
.hp-win-charts button:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--cobalt-accent); }
.hp-win-charts img { display: block; width: 100%; height: auto; background: #ffffff; }

.hp-win-datanote { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0 0 10px; font-size: 13px; color: var(--ink-soft); }
.hp-win-datanote strong { font-family: ${DISPLAY}; font-size: 18px; font-weight: 800; color: var(--ink); }
.hp-win-tablewrap { overflow-x: auto; border: 2px solid var(--rule); }
.hp-win-tablewrap table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.hp-win-tablewrap th { padding: 7px 9px; text-align: left; background: var(--paper-alt); color: var(--ink); white-space: nowrap; }
.hp-win-tablewrap td { padding: 8px 9px; border-top: 1px solid var(--hairline); color: var(--ink-soft); white-space: nowrap; }
.hp-win-tablewrap tbody tr:hover td { background: color-mix(in srgb, var(--lime) 35%, transparent); color: var(--ink); }
.hp-win-foot { margin: 8px 0 16px; font-size: 12px; color: var(--ink-faint); }

.hp-win-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 18px 18px; border-inline-start: 2px solid var(--rule); background: var(--paper-alt); }
.hp-win-talk { display: flex; flex-direction: column; gap: 10px; min-height: 150px; }
.hp-win-q { align-self: flex-end; max-width: 92%; margin: 0; padding: 9px 12px; background: var(--ink); color: var(--paper); font-size: 13.5px; line-height: 1.4; animation: hpIn .2s ease backwards; }
.hp-win-a { max-width: 96%; padding: 10px 12px; border: 2px solid var(--rule); background: var(--card); box-shadow: 3px 3px 0 var(--rule); animation: hpIn .3s ease backwards; }
.hp-win-a p { margin: 7px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink); }
.hp-win-a:not(:has(.hp-badge)) p { margin-top: 0; }
.hp-badge.hp-analysis { color: var(--cobalt-accent); }
.hp-win-thinking { width: 64px; }
.hp-dots { display: flex; gap: 5px; }
.hp-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-faint); animation: hpDot 1s ease-in-out infinite; }
.hp-dots i:nth-child(2) { animation-delay: .15s; }
.hp-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes hpDot { 0%, 100% { transform: none; opacity: .45; } 40% { transform: translateY(-4px); opacity: 1; } }
.hp-win-try { margin: 6px 0 0; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.hp-win[dir="rtl"] .hp-win-try { letter-spacing: 0; }
.hp-win-chips { display: flex; flex-direction: column; gap: 6px; }
.hp-win-chips button { padding: 7px 10px; border: 1.5px solid var(--rule); background: var(--card); color: var(--ink); font-size: 12.5px; font-weight: 600; line-height: 1.35; text-align: start; transition: transform .12s ease, box-shadow .12s ease, background-color .15s ease; }
.hp-win-chips button:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--rule); }
.hp-win-chips button[aria-pressed="true"] { background: var(--cobalt); color: #ffffff; border-color: #12121a; box-shadow: 3px 3px 0 var(--lime); }
.hp-win-input { display: flex; margin: auto 0 0; border: 2px solid var(--rule); background: var(--card); }
.hp-win-input:focus-within { box-shadow: 3px 3px 0 var(--cobalt-accent); }
.hp-win-input input { flex: 1; min-width: 0; padding: 10px 12px; border: none; background: transparent; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
.hp-win-input input::placeholder { color: var(--ink-faint); }
.hp-win-input button { display: grid; place-items: center; width: 40px; border: none; border-inline-start: 2px solid var(--rule); background: var(--lime); color: #12121a; }
.hp-win[dir="rtl"] .hp-win-input button svg { transform: scaleX(-1); }
.hp-win-tucked { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 22px 20px; font-size: 14px; color: var(--ink-soft); }
.hp-win-tucked button { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border: 2px solid #12121a; background: var(--lime); color: #12121a; font-weight: 700; }
.hp-win[dir="rtl"] .hp-win-tucked svg { transform: scaleX(-1); }
.hp-win[dir="rtl"] .hp-win-eyebrow, .hp-win[dir="rtl"] .hp-win-title, .hp-win[dir="rtl"] .hp-win-stat strong { letter-spacing: 0; }
@media (max-width: 759px) {
  .hp-win-body { grid-template-columns: minmax(0, 1fr); }
  .hp-win-side { border-inline-start: none; border-top: 2px solid var(--rule); }
  .hp-win-talk { min-height: 0; }
  .hp-win-charts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .hp-win, .hp-win *, .hp-dots i { animation: none !important; transition: none !important; }
}

/* ── Security ────────────────────────────────────────────────────────── */
.hp-trust { padding: 76px clamp(16px, 3vw, 32px); background: var(--cobalt); color: #ffffff; border-bottom: 2px solid var(--rule); }
.hp-trust .hp-eyebrow { color: #d6f24a; }
.hp-trust .hp-h2 { color: #ffffff; }
.hp-trust .hp-sub { color: rgba(255,255,255,.82); }
.hp-promises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin: 0; padding: 0; list-style: none; }
.hp-promises li { padding: 24px 22px; border: 2px solid #12121a; background: rgba(255,255,255,.08); box-shadow: 6px 6px 0 #12121a; }
.hp-promise-ic { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; margin-bottom: 16px; border: 2px solid #12121a; background: #d6f24a; color: #12121a; }
.hp-promise-ic.hp-promise-del { background: var(--red); }
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
.hp-vs-wrap .hp-sub { max-width: 60ch; margin-bottom: 48px; font-size: 17.5px; color: rgba(242,239,233,.8); }
.hp-vs-wrap button { font: inherit; cursor: pointer; }

.hp-powers { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 22px; align-items: start; }
.hp-power-tabs { display: flex; flex-direction: column; gap: 8px; }
.hp-power-tabs button { display: grid; grid-template-columns: 38px minmax(0, 1fr) 16px; align-items: center; gap: 12px; padding: 16px 18px; border: 2px solid rgba(242,239,233,.16); background: rgba(255,255,255,.03); color: #f2efe9; text-align: start; transition: transform .15s ease, box-shadow .15s ease, background-color .2s ease, border-color .2s ease; }
.hp-power-tabs b { font-family: ${DISPLAY}; font-size: 15px; font-weight: 800; letter-spacing: .06em; color: #d6f24a; }
.hp-power-tabs span { font-family: ${DISPLAY}; font-size: clamp(17px, 1.6vw, 20px); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; }
.hp-power-tabs svg { opacity: 0; transform: translateX(-6px); transition: opacity .15s ease, transform .15s ease; }
[dir="rtl"] .hp-power-tabs svg { transform: scaleX(-1) translateX(-6px); }
.hp-power-tabs button:hover { border-color: rgba(214,242,74,.7); background: rgba(214,242,74,.08); transform: translateX(4px); }
[dir="rtl"] .hp-power-tabs button:hover { transform: translateX(-4px); }
.hp-power-tabs button:hover svg { opacity: 1; transform: none; }
[dir="rtl"] .hp-power-tabs button:hover svg { transform: scaleX(-1); }
.hp-power-tabs button[aria-selected="true"] { background: #d6f24a; border-color: #d6f24a; color: #12121a; box-shadow: 6px 6px 0 #2536e0; transform: none; }
.hp-power-tabs button[aria-selected="true"] b { color: #2536e0; }
.hp-power-tabs button[aria-selected="true"] svg { opacity: 1; transform: none; }
[dir="rtl"] .hp-power-tabs button[aria-selected="true"] svg { transform: scaleX(-1); }
.hp-power-tabs button:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }

.hp-stage { min-height: 470px; padding: clamp(24px, 3vw, 38px); border: 2px solid rgba(242,239,233,.16); background: linear-gradient(160deg, #1b1d33, #14141f 60%); box-shadow: 0 30px 80px rgba(0,0,0,.35); animation: hpIn .35s ease backwards; }
.hp-stage h3 { margin: 0 0 12px; font-family: ${DISPLAY}; font-size: clamp(28px, 3.2vw, 42px); font-weight: 800; line-height: 1.04; letter-spacing: -0.04em; color: #ffffff; }
.hp-stage-body { max-width: 58ch; margin: 0 0 24px; font-size: 16.5px; line-height: 1.6; color: rgba(242,239,233,.78); }
.hp-stage-pro { display: flex; align-items: baseline; gap: 10px; margin: 20px 0 0; font-size: 14px; color: rgba(242,239,233,.72); }
.hp-stage-pro em { padding: 2px 7px; border: 1.5px solid #12121a; background: #d6f24a; color: #12121a; font-size: 11px; font-style: normal; font-weight: 800; letter-spacing: .06em; }
[dir="rtl"] .hp-vs-head, [dir="rtl"] .hp-stage h3, [dir="rtl"] .hp-power-tabs span { letter-spacing: 0; line-height: 1.35; }

.hp-scene { padding: 18px; border: 2px solid rgba(242,239,233,.14); background: #0e0e15; }
.hp-scene-head { margin: 0 0 12px; font-size: 12.5px; font-weight: 700; color: rgba(242,239,233,.62); }
.hp-ex { margin-inline-end: 6px; padding: 2px 7px; border: 1.5px solid rgba(242,239,233,.4); font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #f2efe9; }
[dir="rtl"] .hp-ex { letter-spacing: 0; }
.hp-picks { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.hp-picks button { padding: 8px 14px; border: 2px solid rgba(242,239,233,.22); background: transparent; color: #f2efe9; font-size: 14px; font-weight: 700; transition: transform .12s ease, box-shadow .12s ease, background-color .15s ease, border-color .15s ease; }
.hp-picks button:hover { border-color: #d6f24a; transform: translate(-2px, -2px); box-shadow: 4px 4px 0 rgba(214,242,74,.45); }
.hp-picks button[aria-pressed="true"] { background: #2536e0; border-color: #2536e0; color: #ffffff; box-shadow: 4px 4px 0 #d6f24a; }
.hp-scene-out { margin: 0; padding: 16px 18px; border-inline-start: 4px solid #d6f24a; background: rgba(255,255,255,.05); font-size: 17px; line-height: 1.6; color: #ffffff; animation: hpIn .3s ease backwards; }
.hp-lang-out { font-family: ${DISPLAY}; font-size: clamp(22px, 2.6vw, 32px); font-weight: 800; line-height: 1.25; letter-spacing: -0.02em; }

.hp-chat { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; }
.hp-chat-log { display: flex; flex-direction: column; gap: 10px; }
.hp-chat-q { align-self: flex-end; max-width: 92%; margin: 0; padding: 9px 12px; background: #f2efe9; color: #12121a; font-size: 14px; line-height: 1.4; }
.hp-chat-a { padding: 12px 14px; border: 2px solid rgba(242,239,233,.2); background: #1a1b2a; }
.hp-chat-a > p:first-child { margin: 0; font-size: 14px; line-height: 1.55; color: #f2efe9; }
.hp-chat-offer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed rgba(242,239,233,.25); font-size: 13px; font-weight: 700; color: #d6f24a; }
.hp-chat-offer button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 2px solid #12121a; background: #d6f24a; color: #12121a; font-size: 13px; font-weight: 800; transition: transform .12s ease, box-shadow .12s ease; animation: hpPulse 1.6s ease-in-out infinite; }
.hp-chat-offer button:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 #2536e0; animation: none; }
.hp-chat-done { justify-content: flex-start; color: #9be08f; }
@keyframes hpPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(214,242,74,.5); } 50% { box-shadow: 0 0 0 7px rgba(214,242,74,0); } }
.hp-mini { padding: 14px; border: 2px solid #12121a; background: #f2efe9; color: #12121a; box-shadow: 6px 6px 0 #2536e0; }
.hp-mini-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 12px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #5a5850; }
[dir="rtl"] .hp-mini-bar { letter-spacing: 0; }
.hp-mini-bar button { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border: 1.5px solid #12121a; background: #ffffff; color: #12121a; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: none; }
.hp-mini-bar button:hover { background: #d6f24a; }
.hp-mini-title { display: flex; gap: 10px; margin: 0; font-family: ${DISPLAY}; font-size: 17px; font-weight: 800; line-height: 1.25; }
.hp-mini-title b { color: #2536e0; }
.hp-mini-note { margin: 12px 0 0; padding: 10px 12px; border-inline-start: 3px solid #2536e0; background: rgba(37,54,224,.08); font-size: 13.5px; line-height: 1.5; animation: hpIn .35s ease backwards; }

.hp-team-faces { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.hp-team-faces button { min-width: 42px; height: 42px; padding: 0 10px; border: 2px solid #12121a; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 0 0 2px rgba(242,239,233,.25); transition: transform .15s ease, box-shadow .15s ease; }
.hp-team-faces button:hover { transform: translateY(-3px); }
.hp-team-faces button[aria-pressed="true"] { box-shadow: 0 0 0 3px #d6f24a; transform: translateY(-3px); }
.hp-live { display: inline-flex; align-items: center; gap: 6px; margin-inline-start: auto; font-size: 11.5px; font-weight: 800; letter-spacing: .12em; color: #9be08f; }
.hp-live i { width: 8px; height: 8px; border-radius: 50%; background: #9be08f; animation: hpPulseG 1.4s ease-in-out infinite; }
@keyframes hpPulseG { 0%, 100% { box-shadow: 0 0 0 0 rgba(155,224,143,.6); } 50% { box-shadow: 0 0 0 6px rgba(155,224,143,0); } }
.hp-team-info { min-height: 44px; margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: rgba(242,239,233,.78); }
.hp-team-info b { color: #ffffff; }
.hp-team-doc { display: grid; gap: 10px; padding: 14px; border: 2px solid #12121a; background: #f2efe9; color: #12121a; }
.hp-team-edit { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; font-weight: 600; }
.hp-flag { padding: 2px 7px; font-size: 11.5px; font-weight: 800; }
.hp-caret { width: 2px; height: 17px; background: #12121a; animation: hpCaret 1s steps(1) infinite; }
@keyframes hpCaret { 50% { opacity: 0; } }
.hp-team-say { display: flex; align-items: flex-start; gap: 9px; margin: 0; font-size: 13.5px; line-height: 1.45; animation: hpIn .4s ease backwards; }
.hp-say-1 { animation-delay: .5s; }
.hp-say-2 { animation-delay: 1.3s; padding-inline-start: 22px; }
.hp-team-say > span:last-child { padding: 7px 10px; border: 1.5px solid #12121a; background: #ffffff; }
.hp-face { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 26px; border: 1.5px solid #12121a; border-radius: 50%; font-size: 12px; font-weight: 800; }

.hp-proof-line { margin: 0 0 16px; font-family: ${DISPLAY}; font-size: clamp(22px, 2.6vw, 32px); font-weight: 800; line-height: 1.4; letter-spacing: -0.02em; color: #ffffff; }
[dir="rtl"] .hp-proof-line { letter-spacing: 0; line-height: 1.8; }
.hp-proof-line button { margin: 0 2px; padding: 0 6px; border: none; border-bottom: 3px dashed #d6f24a; background: none; color: #d6f24a; font-weight: 800; transition: background-color .15s ease, color .15s ease; }
.hp-proof-line button:hover, .hp-proof-line button[aria-pressed="true"] { background: #d6f24a; color: #12121a; border-bottom-color: #12121a; }
.hp-proof-check { min-height: 96px; }
.hp-hint { display: inline-block; font-size: 14px; font-weight: 700; color: rgba(242,239,233,.6); animation: hpNudge 1.8s ease-in-out infinite; }
@keyframes hpNudge { 0%, 100% { transform: none; } 50% { transform: translateY(-3px); } }
.hp-proof-in { padding: 14px 16px; border: 2px solid #9be08f; background: rgba(155,224,143,.08); animation: hpIn .3s ease backwards; }
.hp-proof-ok { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #9be08f; }
[dir="rtl"] .hp-proof-ok { letter-spacing: 0; }
.hp-proof-in p { margin: 8px 0 0; font-size: 15px; line-height: 1.5; font-variant-numeric: tabular-nums; color: #ffffff; }

@media (max-width: 899px) {
  .hp-powers { grid-template-columns: minmax(0, 1fr); }
  .hp-power-tabs { flex-direction: row; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin; }
  .hp-power-tabs button { flex: 0 0 auto; grid-template-columns: auto auto; padding: 12px 14px; }
  .hp-power-tabs svg { display: none; }
  .hp-stage { min-height: 0; }
}
@media (max-width: 759px) {
  .hp-chat { grid-template-columns: minmax(0, 1fr); }
  .hp-vs-wrap::before { width: 420px; height: 420px; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-vs-wrap *, .hp-vs-wrap *::before { animation: none !important; transition: none !important; }
}

/* ── The founder ─────────────────────────────────────────────────────── */
.hp-founder { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 56px; align-items: start; }
.hp-founder-card { padding: 20px; border: 2px solid var(--rule); background: var(--card); box-shadow: 8px 8px 0 var(--cobalt-accent), 16px 16px 0 var(--red); }
.hp-founder-mono { display: grid; place-items: center; aspect-ratio: 1; border: 2px solid #12121a; background: var(--lime); color: #12121a; font-family: ${DISPLAY}; font-size: 64px; font-weight: 800; letter-spacing: -0.05em; }
.hp-founder-who strong { display: block; margin: 16px 0 4px; font-family: ${DISPLAY}; font-size: 18px; font-weight: 700; color: var(--ink); }
.hp-founder-who > span { display: block; font-size: 13.5px; line-height: 1.45; color: var(--ink-soft); }
.hp-founder-in { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 14px; font-weight: 700; color: var(--ink); text-decoration: none; --icon-cut: var(--card); }
.hp-founder-in:hover { color: var(--cobalt-accent); }
.hp-quote { margin: 0; padding: 0; font-family: ${DISPLAY}; font-size: clamp(21px, 2.3vw, 28px); font-weight: 600; line-height: 1.38; letter-spacing: -0.015em; color: var(--ink); }
.hp-quote p { margin: 0; }
.hp-quote p::before { content: '“'; color: var(--cobalt-accent); }
.hp-quote p::after { content: '”'; color: var(--cobalt-accent); }
[dir="rtl"] .hp-quote p::before { content: '«'; }
[dir="rtl"] .hp-quote p::after { content: '»'; }
[dir="rtl"] .hp-quote { letter-spacing: 0; line-height: 1.8; }
@media (max-width: 759px) {
  .hp-founder { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .hp-founder-card { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 16px; align-items: center; order: 2; margin-right: 16px; }
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
  .hp-promises { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 519px) {
  .hp-win-main { padding: 12px 14px 0; }
  .hp-win-tabs button { padding: 6px 9px; }
  .hp-win-stat strong { font-size: 28px; }
  .hp-foot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 20px; }
  .hp-close-btns .hp-btn { flex: 1 1 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-faq details, .hp-faq summary svg { transition: none !important; }
}
`;
