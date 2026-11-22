/**
 * The demo's stylesheet. Every class starts with `dg-` so nothing here can
 * reach another page, and every colour is one of the theme's tokens
 * (globals.css, ATLAS), so the demo follows Light and Dark like the rest.
 */

const DISPLAY = 'var(--font-display), "Bricolage Grotesque", Georgia, serif';
const SANS = 'var(--font-sans), "Work Sans", system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Consolas, monospace';

export const DEMO_CSS = `
/* Text on an inverted (ink) panel: lime reads on the near-black panel of the
   light theme, a dark olive on the cream panel of the dark theme. */
.dg-page { --dg-ink-accent: #4d5c00; }
:root[data-theme="light"] .dg-page { --dg-ink-accent: var(--lime); }
.dg-page { background: var(--paper); color: var(--ink); min-height: 100vh; font-family: ${SANS}; overflow-x: clip; }
.dg-page h1, .dg-page h2, .dg-page h3 { font-family: ${DISPLAY}; }

/* ── Buttons ─────────────────────────────────────────────────────────── */
.dg-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 18px; border: 2px solid var(--rule);
  background: var(--card); color: var(--ink); font: inherit; font-size: 14px; font-weight: 700;
  cursor: pointer; text-decoration: none; transition: transform .12s ease, box-shadow .12s ease;
}
.dg-btn:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--rule); }
.dg-btn:active { transform: none; box-shadow: none; }
.dg-btn.lime { background: var(--lime); color: #12121a; border-color: #12121a; }
.dg-btn.cobalt { background: var(--cobalt); color: #ffffff; }
.dg-btn.ghost { background: transparent; border-color: var(--line); color: var(--ink-soft); font-weight: 600; }
.dg-btn.small { min-height: 36px; padding: 0 11px; font-size: 12.5px; }
.dg-btn:disabled { opacity: .4; cursor: default; transform: none; box-shadow: none; }
.dg-page button:focus-visible, .dg-page a:focus-visible, .dg-page input:focus-visible {
  outline: 3px solid var(--cobalt-accent); outline-offset: 2px;
}
@media (pointer: coarse) { .dg-btn.small { min-height: 44px; } }

/* ── Header and the trail of stops ───────────────────────────────────── */
.dg-top { position: sticky; top: 0; z-index: 40; background: var(--paper); border-bottom: 2px solid var(--rule); }
.dg-head { display: flex; align-items: center; gap: 10px; padding: 8px clamp(16px, 3vw, 32px); min-height: 56px; max-width: 1264px; margin: 0 auto; }
.dg-logo { font-family: ${DISPLAY}; font-weight: 800; font-size: 21px; letter-spacing: -0.04em; color: var(--ink); text-decoration: none; }
.dg-tag { background: var(--lime); color: #12121a; border: 1.5px solid #12121a; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; padding: 3px 7px; }
.dg-head-right { margin-inline-start: auto; display: flex; gap: 8px; align-items: center; }
.dg-short { display: none; }
.dg-rail { max-width: 1264px; margin: 0 auto; padding: 30px clamp(16px, 3vw, 32px) 10px; }
.dg-track { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dg-line, .dg-line-done { position: absolute; top: 8px; height: 2px; left: calc(100% / 14); }
.dg-line { right: calc(100% / 14); background: var(--hairline); }
.dg-line-done { background: var(--cobalt-accent); transition: width .6s ease; }
.dg-stop {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: none; border: none; padding: 0 2px 4px; cursor: pointer; color: var(--ink-faint);
  font: inherit; font-size: 12px; font-weight: 600; min-height: 44px;
}
.dg-dot { width: 18px; height: 18px; border: 2px solid var(--rule); background: var(--paper); transform: rotate(45deg); transition: background .3s, transform .3s; }
.dg-stop.seen .dg-dot { background: var(--lime); }
.dg-stop[aria-current] { color: var(--ink); }
.dg-stop[aria-current] .dg-dot { background: var(--cobalt); transform: rotate(45deg) scale(1.2); }
.dg-stop:hover .dg-dot { transform: rotate(45deg) scale(1.15); }
.dg-walker { position: absolute; top: -32px; width: 24px; margin-left: -12px; transition: left .7s cubic-bezier(.45,.05,.3,1); pointer-events: none; }
.dg-walker svg { width: 24px; height: 36px; }
.dg-walker.walking .dg-body { animation: dgStep .22s ease-in-out infinite !important; }

/* ── Intro band ──────────────────────────────────────────────────────── */
.dg-intro { background: var(--cobalt); color: #ffffff; border-bottom: 2px solid var(--rule); }
.dg-intro-in { max-width: 1264px; margin: 0 auto; padding: clamp(22px, 4vw, 40px) clamp(16px, 3vw, 32px); display: flex; flex-wrap: wrap; gap: 14px 40px; align-items: end; justify-content: space-between; }
.dg-intro h1 { margin: 0; font-size: clamp(32px, 5.4vw, 60px); font-weight: 800; letter-spacing: -0.045em; line-height: .98; }
.dg-intro p { margin: 0; max-width: 46ch; font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.85); }
.dg-intro .dg-eyebrow { color: #d6f24a; }

/* ── Workspace: DIG on the left, the stop on the right ───────────────── */
.dg-work { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: clamp(20px, 3vw, 40px); max-width: 1264px; margin: 0 auto; padding: 30px clamp(16px, 3vw, 32px) 90px; align-items: start; }
.dg-guide { position: sticky; top: 150px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.dg-say { width: 100%; }
.dg-bubble {
  position: relative; margin: 0; background: var(--card); border: 2px solid var(--rule);
  box-shadow: 4px 4px 0 var(--rule); padding: 14px 16px; font-size: 14.5px; line-height: 1.5;
  min-height: 92px; animation: dgPop .35s cubic-bezier(.34,1.56,.64,1);
}
.dg-bubble::after {
  content: ''; position: absolute; bottom: -9px; left: 50%; width: 14px; height: 14px; background: var(--card);
  border-right: 2px solid var(--rule); border-bottom: 2px solid var(--rule); transform: translateX(-50%) rotate(45deg);
}
.dg-digwrap { display: flex; flex-direction: column; align-items: center; }
.dg-digbtn { background: none; border: none; cursor: pointer; padding: 4px 10px 0; position: relative; z-index: 1; }
.dg-digbtn svg { width: 101px; height: 150px; display: block; }
.dg-stand { width: 120px; height: 16px; background: var(--lime); border: 2px solid #12121a; border-radius: 50%; margin-top: -14px; }
.dg-nav { display: flex; gap: 8px; width: 100%; }
.dg-nav .dg-btn { flex: 1; padding: 0 10px; }
.dg-meter { width: 100%; font-size: 12px; color: var(--ink-faint); }
.dg-meter-bar { height: 8px; border: 1.5px solid var(--rule); margin-top: 5px; background: var(--paper-alt); }
.dg-meter-bar span { display: block; height: 100%; background: var(--cobalt-accent); transition: width .4s ease; }
.dg-keys { font-size: 11.5px; color: var(--ink-faint); margin: 0; }

.dg-eyebrow { margin: 0 0 8px; font-size: 11.5px; letter-spacing: .2em; font-weight: 700; color: var(--ink-faint); }
.dg-h2 { margin: 0 0 10px; font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; }
.dg-lead { margin: 0 0 22px; color: var(--ink-soft); font-size: 16px; line-height: 1.6; max-width: 62ch; }
.dg-stage { min-width: 0; animation: dgEnter .45s ease backwards; }
.dg-card { background: var(--card); border: 2px solid var(--rule); box-shadow: 6px 6px 0 var(--rule); padding: clamp(16px, 2.4vw, 26px); }
.dg-note {
  display: flex; gap: 12px; align-items: flex-start; margin-top: 14px; border: 2px solid var(--rule);
  background: var(--paper-alt); padding: 12px 14px; font-size: 14px; line-height: 1.5; animation: dgEnter .3s ease backwards;
}
.dg-kind { flex-shrink: 0; background: var(--cobalt); color: #ffffff; font-size: 10.5px; font-weight: 800; letter-spacing: .12em; padding: 4px 8px; text-transform: uppercase; }

/* ── 1 Upload ────────────────────────────────────────────────────────── */
.dg-upload { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 22px; align-items: stretch; }
.dg-file {
  cursor: grab; user-select: none; background: var(--card); border: 2px solid var(--rule); box-shadow: 4px 4px 0 var(--rule);
  padding: 16px; display: flex; flex-direction: column; gap: 10px; transform: rotate(-3deg); transition: transform .2s ease;
  font: inherit; color: inherit; text-align: start;
}
.dg-file:hover { transform: rotate(0) translateY(-4px); }
.dg-file.gone { opacity: .35; transform: rotate(0) scale(.94); cursor: default; }
.dg-sheet { width: 48px; height: 60px; position: relative; background: #ffffff; border: 2px solid #12121a; clip-path: polygon(0 0, 68% 0, 100% 24%, 100% 100%, 0 100%); }
.dg-sheet::before { content: 'CSV'; position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; background: #d6f24a; color: #12121a; font-size: 10px; font-weight: 800; letter-spacing: .06em; }
.dg-file small { color: var(--ink-faint); font-size: 12px; }
.dg-drop {
  border: 2.5px dashed var(--line); display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; min-height: 220px; text-align: center; padding: 22px; background: var(--paper-alt); transition: background .2s, border-color .2s;
}
.dg-drop.over { border-color: var(--cobalt-accent); background: color-mix(in srgb, var(--cobalt) 12%, var(--paper-alt)); }
.dg-drop p { margin: 0; color: var(--ink-soft); }
.dg-progress { height: 12px; border: 2px solid var(--rule); width: min(320px, 100%); background: var(--card); }
.dg-progress span { display: block; height: 100%; width: 0; background: var(--lime); animation: dgFill 1.25s ease forwards; }
.dg-facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.dg-fact { border: 2px solid var(--rule); padding: 6px 10px; font-size: 13px; font-weight: 700; background: var(--card); }
.dg-tablewrap { overflow-x: auto; border: 2px solid var(--rule); background: var(--card); }
.dg-table { border-collapse: collapse; width: 100%; min-width: 760px; font-size: 13px; font-variant-numeric: tabular-nums; }
.dg-table th { padding: 0; border-bottom: 2px solid var(--rule); background: var(--paper-alt); text-align: start; }
.dg-table th button {
  display: flex; align-items: center; gap: 7px; width: 100%; min-height: 44px; padding: 8px 12px; border: none;
  background: transparent; color: var(--ink); cursor: pointer; font-family: ${MONO}; font-size: 12.5px; font-weight: 700; text-align: start;
}
.dg-table th button:hover, .dg-table th button[aria-expanded="true"] { background: var(--lime); color: #12121a; }
.dg-table td { padding: 9px 12px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
.dg-table .on { background: color-mix(in srgb, var(--lime) 28%, transparent); }
.dg-hot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--cobalt-accent); animation: dgPulse 1.6s ease-in-out infinite; }
.dg-hot.seen { background: var(--ink-faint); animation: none; opacity: .5; }

/* ── 2 Check ─────────────────────────────────────────────────────────── */
.dg-scan { position: relative; border: 2px solid var(--rule); background: var(--card); padding: 10px 12px; display: grid; gap: 4px; overflow: hidden; }
.dg-scan i { display: block; height: 6px; background: var(--hairline); }
.dg-scan i.flag-dup { animation: dgFlagDup .3s ease forwards; animation-delay: var(--d); }
.dg-scan i.flag-blank { animation: dgFlagBlank .3s ease forwards; animation-delay: var(--d); }
.dg-scan i.flag-neg { animation: dgFlagNeg .3s ease forwards; animation-delay: var(--d); }
.dg-scan::after {
  content: ''; position: absolute; left: 0; right: 0; height: 30px; top: -30px;
  background: linear-gradient(transparent, color-mix(in srgb, var(--lime) 60%, transparent)); animation: dgScan 1.7s ease-in-out forwards;
}
.dg-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 10px 0 0; font-size: 12.5px; color: var(--ink-soft); }
.dg-legend span::before { content: ''; display: inline-block; width: 10px; height: 10px; margin-inline-end: 6px; background: var(--c); vertical-align: -1px; }
.dg-flips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
.dg-flip { display: block; width: 100%; perspective: 900px; background: none; border: none; padding: 0; cursor: pointer; text-align: start; font: inherit; color: inherit; animation: dgEnter .4s ease backwards; animation-delay: var(--d); }
.dg-flip-in { display: block; position: relative; min-height: 196px; transition: transform .6s cubic-bezier(.4,.2,.2,1); transform-style: preserve-3d; }
.dg-flip[aria-pressed="true"] .dg-flip-in { transform: rotateY(180deg); }
.dg-face {
  position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border: 2px solid var(--rule);
  background: var(--card); box-shadow: 4px 4px 0 var(--rule); padding: 16px; display: flex; flex-direction: column; gap: 6px;
}
.dg-face.back { transform: rotateY(180deg); background: var(--ink); color: var(--paper); }
.dg-face small { margin-top: auto; font-size: 12px; font-weight: 700; color: var(--cobalt-accent); }
.dg-face.back small { align-self: flex-start; background: var(--lime); color: #12121a; padding: 2px 8px; }
.dg-big { font-family: ${DISPLAY}; font-size: 54px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; }
.dg-flip:nth-child(1) .dg-big { color: var(--warn-text); }
.dg-flip:nth-child(2) .dg-big { color: var(--cobalt-accent); }
.dg-flip:nth-child(3) .dg-big { color: var(--danger-text); }

/* ── 3 Clean ─────────────────────────────────────────────────────────── */
.dg-q { font-family: ${DISPLAY}; font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 12px; }
.dg-list { margin: 0 0 18px; padding-inline-start: 20px; line-height: 1.7; color: var(--ink-soft); }
.dg-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dg-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 4px 0 18px; }
.dg-stat { border: 2px solid var(--rule); padding: 14px; background: var(--paper-alt); }
.dg-stat span { display: block; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: var(--ink-faint); text-transform: uppercase; }
.dg-stat s { display: inline-block; margin-top: 6px; color: var(--ink-faint); font-size: 18px; text-decoration-thickness: 2px; text-decoration-color: var(--danger); }
.dg-stat strong { display: block; font-family: ${DISPLAY}; font-size: 36px; font-weight: 800; letter-spacing: -0.04em; animation: dgPopIn .5s cubic-bezier(.34,1.56,.64,1) both; animation-delay: var(--d); }

/* ── 4 What is it ────────────────────────────────────────────────────── */
.dg-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dg-option {
  display: flex; align-items: center; gap: 12px; min-height: 66px; padding: 12px 16px; border: 2px solid var(--rule);
  background: var(--card); color: var(--ink); font: inherit; font-size: 15px; font-weight: 600; text-align: start; cursor: pointer;
  transition: transform .12s, box-shadow .12s;
}
.dg-option:hover:not(:disabled) { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--rule); }
.dg-option.wrong { animation: dgShake .45s ease; border-color: var(--danger); color: var(--ink-faint); text-decoration: line-through; cursor: default; }
.dg-option.right { background: var(--lime); color: #12121a; border-color: #12121a; }
.dg-emoji { font-size: 26px; line-height: 1; }
.dg-focus { margin-top: 18px; border: 2px solid var(--rule); background: var(--ink); color: var(--paper); padding: 18px; animation: dgEnter .4s ease backwards; }
.dg-focus .dg-eyebrow { color: var(--dg-ink-accent); }
.dg-focus p { margin: 0; }
.dg-focus .dg-quote { font-family: ${DISPLAY}; font-size: clamp(20px, 2.6vw, 28px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 10px; }

/* ── 5 Report ────────────────────────────────────────────────────────── */
.dg-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; border: 2px solid var(--rule); background: var(--paper-alt); margin-bottom: 18px; }
.dg-version { font-weight: 800; font-size: 11.5px; letter-spacing: .1em; background: var(--ink); color: var(--paper); padding: 5px 9px; text-transform: uppercase; }
.dg-saved { font-size: 12.5px; color: var(--ok-text); font-weight: 700; }
.dg-hint { font-size: 12.5px; color: var(--ink-faint); margin-inline-start: auto; }
.dg-titlerow { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
.dg-rtitle { margin: 0; font-size: clamp(22px, 2.6vw, 30px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.12; flex: 1; }
.dg-titleinput { flex: 1; font: inherit; font-family: ${DISPLAY}; font-size: clamp(20px, 2.4vw, 26px); font-weight: 800; padding: 6px 10px; border: 2px solid var(--cobalt-accent); background: var(--card); color: var(--ink); min-width: 0; }
.dg-summary { font-size: 15px; line-height: 1.7; color: var(--ink-soft); margin: 0; }
.dg-ev {
  font: inherit; font-weight: 700; color: var(--cobalt-accent); background: none; border: none; padding: 0 2px;
  border-bottom: 2px dashed currentColor; cursor: pointer;
}
.dg-ev[aria-expanded="true"] { background: var(--lime); color: #12121a; border-bottom-style: solid; }
.dg-insight { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 22px; border-top: 2px solid var(--rule); padding: 22px 0; animation: dgEnter .35s ease backwards; }
.dg-insight h3 { margin: 4px 0 8px; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.dg-insight p { margin: 0; font-size: 14px; line-height: 1.65; color: var(--ink-soft); }
.dg-rank { font-family: ${DISPLAY}; font-size: 36px; font-weight: 800; color: var(--cobalt-accent); line-height: 1; letter-spacing: -0.05em; }
.dg-chart { display: block; width: 100%; padding: 0; border: 2px solid var(--rule); background: #0f172a; cursor: zoom-in; position: relative; }
.dg-chart img { display: block; width: 100%; height: auto; }
.dg-zoomtag { position: absolute; right: 8px; bottom: 8px; background: var(--lime); color: #12121a; font-size: 11px; font-weight: 800; padding: 4px 8px; border: 1.5px solid #12121a; opacity: .9; transition: transform .15s; }
.dg-chart:hover .dg-zoomtag { transform: scale(1.06); }
.dg-caption { margin: 8px 0 0; font-size: 12.5px; color: var(--ink-faint); line-height: 1.45; }
.dg-ctrls { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.dg-hidden { border-top: 2px solid var(--rule); padding-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--ink-faint); }
.dg-conclusion { border-top: 2px solid var(--rule); padding-top: 18px; }
.dg-conclusion p { margin: 0; font-size: 15px; line-height: 1.7; color: var(--ink-soft); }

.dg-lightbox { position: fixed; inset: 0; z-index: 80; background: rgba(10, 12, 24, .84); display: flex; align-items: center; justify-content: center; padding: 18px; animation: dgFade .2s ease; }
.dg-lightbox figure { margin: 0; width: min(1040px, 100%); max-height: 100%; overflow: auto; background: var(--card); border: 2px solid var(--rule); padding: 14px; animation: dgZoom .3s cubic-bezier(.34,1.56,.64,1); }
.dg-lightbox img { display: block; width: auto; max-width: 100%; height: auto; max-height: calc(100vh - 170px); margin: 0 auto; }
.dg-lightbox figcaption { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; padding-top: 12px; font-size: 14px; line-height: 1.5; color: var(--ink-soft); }
.dg-lightbox figcaption strong { display: block; color: var(--ink); font-family: ${DISPLAY}; font-size: 18px; }

/* ── 6 Ask ───────────────────────────────────────────────────────────── */
.dg-chat { border: 2px solid var(--rule); background: var(--card); display: flex; flex-direction: column; box-shadow: 6px 6px 0 var(--rule); }
.dg-msgs { padding: 16px; display: flex; flex-direction: column; gap: 12px; height: 360px; overflow-y: auto; }
.dg-msg { max-width: 84%; padding: 10px 14px; font-size: 14.5px; line-height: 1.5; animation: dgEnter .3s ease backwards; }
.dg-msg.you { align-self: flex-end; background: var(--cobalt); color: #ffffff; }
.dg-msg.dig { align-self: flex-start; background: var(--paper-alt); border: 2px solid var(--rule); }
.dg-src { display: inline-block; margin-top: 8px; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 3px 7px; border: 1.5px solid currentColor; }
.dg-src.data { color: var(--ok-text); }
.dg-src.analysis { color: var(--cobalt-accent); }
.dg-src.refused { color: var(--warn-text); }
.dg-typing { display: inline-flex; gap: 5px; padding: 14px 16px; }
.dg-typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-faint); animation: dgDots 1s ease-in-out infinite; }
.dg-typing i:nth-child(2) { animation-delay: .15s; }
.dg-typing i:nth-child(3) { animation-delay: .3s; }
.dg-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-top: 2px solid var(--rule); background: var(--paper-alt); }
.dg-chip { border: 1.5px solid var(--line); background: var(--card); color: var(--ink); padding: 8px 12px; min-height: 40px; font: inherit; font-size: 13.5px; cursor: pointer; text-align: start; }
.dg-chip:hover:not(:disabled) { border-color: var(--cobalt-accent); }
.dg-chip:disabled { opacity: .45; cursor: default; text-decoration: line-through; }
.dg-type { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--hairline); }
.dg-type input { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border: 2px solid var(--line); background: var(--paper); color: var(--ink-faint); font: inherit; font-size: 14px; cursor: pointer; }

/* ── 7 Files ─────────────────────────────────────────────────────────── */
.dg-files { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.dg-filecard {
  display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 2px solid var(--rule); background: var(--card);
  color: var(--ink); text-decoration: none; box-shadow: 4px 4px 0 var(--rule); transition: transform .12s, box-shadow .12s;
}
.dg-filecard:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--rule); }
.dg-filecard strong { font-size: 15px; }
.dg-filecard small { color: var(--ink-faint); font-size: 12px; }
.dg-ext { width: 46px; height: 56px; color: #ffffff; font-size: 10.5px; font-weight: 800; letter-spacing: .04em; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px; clip-path: polygon(0 0, 68% 0, 100% 24%, 100% 100%, 0 100%); margin-bottom: 4px; }
.dg-ext.pdf { background: #c0362c; } .dg-ext.docx { background: #2536e0; } .dg-ext.pptx { background: #c4521d; } .dg-ext.csv { background: #1f7a3a; }
.dg-plan { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--cobalt-accent); margin-top: auto; }
.dg-cta { background: var(--cobalt); color: #ffffff; padding: clamp(20px, 3vw, 32px); margin-top: 26px; border: 2px solid var(--rule); display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
.dg-cta h3 { margin: 0 0 4px; font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.03em; }
.dg-cta p { margin: 0; color: rgba(255,255,255,.85); font-size: 14.5px; }
.dg-cta .dg-btn.ghost { color: #ffffff; border-color: rgba(255,255,255,.6); }

/* ── Confetti, with coffee beans ─────────────────────────────────────── */
.dg-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 90; overflow: hidden; }
.dg-confetti i { position: absolute; top: -24px; left: var(--x); width: 10px; height: 10px; background: var(--c); transform: rotate(var(--r)); animation: dgFall var(--t) cubic-bezier(.2,.6,.4,1) var(--d) forwards; }
.dg-confetti i.bean { width: 12px; height: 16px; border-radius: 50%; background: #6b4226; }
.dg-confetti i.bean::after { content: ''; position: absolute; left: 50%; top: 2px; bottom: 2px; width: 1.6px; background: #3b2314; transform: translateX(-50%) rotate(12deg); }

/* ── DIG's moves ─────────────────────────────────────────────────────── */
.dg-dig .dg-body { transform-origin: 25px 76px; }
.dg-mood-idle .dg-body, .dg-mood-point .dg-body, .dg-mood-sip .dg-body, .dg-mood-think .dg-body { animation: dgBreathe 2.4s ease-in-out infinite; }
.dg-mood-cheer .dg-body { animation: dgHop .6s cubic-bezier(.34,1.56,.64,1) 2; }
.dg-mood-catch .dg-body { animation: dgSquash .45s ease 1; }
.dg-mood-wave .dg-body { animation: dgSway 1.8s ease-in-out infinite; }
.dg-mood-no .dg-head { animation: dgNo .5s ease 2; transform-origin: 24px 32px; }
.dg-mood-sleep .dg-body { animation: dgSnore 3s ease-in-out infinite; }
.dg-mood-point .dg-body { animation: dgLean 1.6s ease-in-out infinite; }
.dg-wave-arm { transform-origin: 36px 38px; animation: dgWave .9s ease-in-out infinite; }
.dg-glass { transform-origin: 44px 57px; animation: dgGlass 1.1s ease-in-out infinite; }
.dg-eyes { transform-origin: 24px 21px; animation: dgBlink 4.4s infinite; }
.dg-steam { animation: dgSteam 1.8s ease-in-out infinite; }
.dg-steam-2 { animation-delay: .6s; }
.dg-zzz text { animation: dgZ 2.4s ease-in-out infinite; }
.dg-zzz text:nth-child(2) { animation-delay: .4s; }
.dg-zzz text:nth-child(3) { animation-delay: .8s; }
.dg-think { animation: dgFloat 1.6s ease-in-out infinite; }
.dg-sparkles { animation: dgTwinkle .5s ease-in-out infinite alternate; }

/* dgEnter fills backwards only: a transform left on after the animation would
   make the stage the frame for the fixed chart lightbox. */
@keyframes dgEnter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes dgPop { 0% { transform: scale(.92); opacity: .4; } 100% { transform: none; opacity: 1; } }
@keyframes dgPopIn { 0% { transform: scale(.4); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes dgFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dgZoom { from { transform: scale(.85); } to { transform: none; } }
@keyframes dgFill { to { width: 100%; } }
@keyframes dgPulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cobalt-accent) 60%, transparent); } 50% { box-shadow: 0 0 0 6px transparent; } }
@keyframes dgScan { from { top: -30px; } to { top: 100%; } }
@keyframes dgFlagDup { to { background: var(--warn); } }
@keyframes dgFlagBlank { to { background: var(--cobalt-accent); } }
@keyframes dgFlagNeg { to { background: var(--danger); } }
@keyframes dgShake { 0%, 100% { transform: none; } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@keyframes dgDots { 0%, 100% { transform: none; opacity: .4; } 50% { transform: translateY(-4px); opacity: 1; } }
@keyframes dgFall { to { transform: translate(var(--dx), 110vh) rotate(calc(var(--r) + 540deg)); } }
@keyframes dgBreathe { 0%, 100% { transform: none; } 45% { transform: scale(1.025, .975); } }
@keyframes dgHop { 0%, 100% { transform: none; } 35% { transform: translateY(-12px) rotate(-6deg); } 65% { transform: translateY(-5px) rotate(5deg); } }
@keyframes dgSquash { 0%, 100% { transform: none; } 30% { transform: scale(1.18, .8); } 65% { transform: scale(.92, 1.1); } }
@keyframes dgSway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes dgLean { 0%, 100% { transform: rotate(4deg); } 50% { transform: rotate(7deg); } }
@keyframes dgNo { 0%, 100% { transform: none; } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
@keyframes dgSnore { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.04, .95); } }
@keyframes dgWave { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-28deg); } }
@keyframes dgGlass { 0%, 100% { transform: none; } 30% { transform: rotate(-18deg) translateX(-3px); } 65% { transform: rotate(14deg) translateX(3px); } }
@keyframes dgBlink { 0%, 93%, 100% { transform: none; } 96% { transform: scaleY(.1); } }
@keyframes dgSteam { 0% { opacity: 0; transform: translateY(3px); } 40% { opacity: .9; } 100% { opacity: 0; transform: translateY(-5px); } }
@keyframes dgZ { 0%, 100% { opacity: .2; transform: translateY(2px); } 50% { opacity: 1; transform: translateY(-2px); } }
@keyframes dgFloat { 0%, 100% { transform: none; } 50% { transform: translateY(-3px); } }
@keyframes dgTwinkle { from { opacity: .4; } to { opacity: 1; } }
@keyframes dgStep { 0%, 100% { transform: none; } 50% { transform: translateY(-3px); } }

/* ── Phone and tablet: DIG moves to a bar at the bottom ──────────────── */
@media (max-width: 860px) {
  .dg-work { grid-template-columns: minmax(0, 1fr); padding-bottom: 210px; }
  .dg-guide {
    position: fixed; inset: auto 0 0 0; top: auto; z-index: 45; background: var(--paper); border-top: 2px solid var(--rule);
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: 70px minmax(0, 1fr);
    grid-template-areas: "dig say" "nav nav"; gap: 8px 12px; align-items: end;
  }
  .dg-say { grid-area: say; }
  .dg-bubble { min-height: 0; font-size: 13.5px; padding: 9px 12px; box-shadow: 3px 3px 0 var(--rule); }
  .dg-bubble::after { left: -9px; bottom: 16px; transform: rotate(135deg); }
  .dg-digwrap { grid-area: dig; }
  .dg-digbtn { padding: 0; }
  .dg-digbtn svg { width: 50px; height: 74px; }
  .dg-stand { width: 60px; height: 10px; margin-top: -8px; }
  .dg-nav { grid-area: nav; }
  .dg-meter, .dg-keys { display: none; }
  .dg-upload, .dg-insight { grid-template-columns: minmax(0, 1fr); }
  .dg-flips, .dg-stats { grid-template-columns: minmax(0, 1fr); }
  .dg-flip-in { min-height: 150px; }
  .dg-hint { margin-inline-start: 0; flex-basis: 100%; }
}
@media (max-width: 640px) {
  .dg-stop .dg-label { display: none; }
  .dg-long { display: none; }
  .dg-short { display: inline; }
  .dg-options { grid-template-columns: minmax(0, 1fr); }
  .dg-file { flex-direction: row; align-items: center; transform: none; }
  .dg-drop { min-height: 170px; }
}

/* ── Small helpers ───────────────────────────────────────────────────── */
.dg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dg-faint { color: var(--ink-faint); font-size: 12.5px; }
.dg-gap { margin: 12px 0 0; }
.dg-tight { margin: 0 0 12px; }
.dg-h3 { margin: 32px 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }

/* ── DIG's "press here" ──────────────────────────────────────────────── */
.dg-coach-wrap { position: relative; display: inline-block; }
.dg-coach-wrap.dg-block { display: block; }
.dg-coach {
  position: absolute; left: 50%; top: calc(100% + 12px); z-index: 6; pointer-events: none; white-space: nowrap;
  background: var(--ink); color: var(--paper); font-size: 12px; font-weight: 800; padding: 6px 10px;
  box-shadow: 3px 3px 0 var(--lime); animation: dgCoach 1.1s ease-in-out infinite;
}
.dg-coach::before { content: ''; position: absolute; top: -5px; left: 50%; width: 10px; height: 10px; background: var(--ink); transform: translateX(-50%) rotate(45deg); }
.dg-coach-hand { display: inline-block; animation: dgTap 1.1s ease-in-out infinite; }
.dg-coach.above { top: auto; bottom: calc(100% + 12px); }
.dg-coach.above::before { top: auto; bottom: -5px; }
.dg-ring { animation: dgRing 1.6s ease-out infinite; }
.dg-drop-title { font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; color: var(--ink) !important; }

/* ── Header extras: the plan switch, chapters, locked steps ─────────── */
.dg-plan-toggle { display: flex; align-items: center; border: 1.5px solid var(--line); }
.dg-plan-toggle button { min-height: 34px; padding: 0 12px; border: none; background: transparent; color: var(--ink-soft); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.dg-plan-toggle button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.dg-plan-label { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--ink-faint); padding: 0 8px; text-transform: uppercase; }
@media (pointer: coarse) { .dg-plan-toggle button { min-height: 44px; } }
.dg-rail { padding-top: 10px; padding-bottom: 6px; }
.dg-chapters { display: grid; gap: 10px; margin-bottom: 2px; }
.dg-chapters span { font-size: 10px; font-weight: 800; letter-spacing: .16em; color: var(--ink-faint); border-bottom: 2px solid var(--hairline); padding-bottom: 3px; text-align: center; transition: color .3s, border-color .3s; }
.dg-chapters span.now { color: var(--ink); border-color: var(--cobalt-accent); }
.dg-chapters span.done { color: var(--ok-text); border-color: var(--lime); }
.dg-track { padding-top: 34px; }
.dg-line, .dg-line-done { top: 42px; }
.dg-walker { top: 0; }
.dg-stop.locked { opacity: .5; }
.dg-stop.locked .dg-dot { border-style: dashed; background: var(--paper-alt); }

/* ── Intro: before and after ─────────────────────────────────────────── */
.dg-ba { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; }
.dg-ba-box { background: #ffffff; color: #12121a; border: 2px solid #12121a; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 190px; box-shadow: 4px 4px 0 #12121a; }
.dg-ba-box.after { background: #d6f24a; }
.dg-ba-k { font-size: 10px; font-weight: 800; letter-spacing: .16em; opacity: .7; }
.dg-ba-box strong { font-family: ${DISPLAY}; font-size: 16px; }
.dg-ba-box span:last-child { font-size: 12.5px; }
.dg-ba-arrow { align-self: center; font-size: 28px; font-weight: 800; animation: dgNudge 1.4s ease-in-out infinite; }
.dg-intro p.dg-intro-note { flex-basis: 100%; max-width: none; font-size: 13px; color: rgba(255,255,255,.78); }

/* ── Guide extras ────────────────────────────────────────────────────── */
.dg-skip { background: none; border: none; color: var(--ink-faint); font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; min-height: 32px; }
.dg-skip:hover { color: var(--ink); }
.dg-side-cta { font-size: 13px; font-weight: 700; color: var(--cobalt-accent); text-decoration: none; border-bottom: 2px solid currentColor; animation: dgEnter .4s ease backwards; }
.dg-digbtn.spin svg { animation: dgSpin .9s cubic-bezier(.34,1.56,.64,1); }

/* ── DIG pops in at the corner to say what just happened ─────────────── */
.dg-pop-zone { position: fixed; right: 18px; bottom: 0; z-index: 70; pointer-events: none; }
.dg-pop { position: relative; pointer-events: auto; display: flex; align-items: flex-end; max-width: min(340px, calc(100vw - 24px)); animation: dgPopUp .55s cubic-bezier(.34,1.56,.64,1) both; }
.dg-pop-bubble { position: relative; background: var(--card); border: 2px solid var(--rule); box-shadow: 4px 4px 0 var(--rule); padding: 12px 14px; font-size: 14px; line-height: 1.45; margin-bottom: 34px; }
.dg-pop-bubble strong { display: block; font-family: ${DISPLAY}; font-size: 16px; color: var(--ok-text); }
.dg-pop-bubble::after { content: ''; position: absolute; right: -9px; bottom: 14px; width: 14px; height: 14px; background: var(--card); border-top: 2px solid var(--rule); border-right: 2px solid var(--rule); transform: rotate(45deg); }
.dg-pop-dig { width: 72px; height: 78px; overflow: hidden; flex-shrink: 0; margin-left: 6px; }
.dg-pop-dig svg { width: 65px; height: 96px; display: block; }
.dg-pop-x { position: absolute; top: -12px; left: -12px; width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--rule); background: var(--card); color: var(--ink); cursor: pointer; font-size: 16px; line-height: 1; padding: 0; }

/* ── The welcome ─────────────────────────────────────────────────────── */
.dg-welcome { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; background: color-mix(in srgb, var(--paper) 35%, rgba(10, 12, 24, .78)); backdrop-filter: blur(3px); animation: dgFade .3s ease; }
.dg-welcome-card { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 10px 28px; align-items: center; width: min(820px, 100%); margin: auto; background: var(--paper); border: 2px solid var(--rule); box-shadow: 10px 10px 0 var(--cobalt); padding: clamp(18px, 3vw, 34px); animation: dgZoom .45s cubic-bezier(.34,1.56,.64,1); }
.dg-welcome-dig { display: flex; flex-direction: column; align-items: center; animation: dgWalkIn 1.3s cubic-bezier(.3,.7,.4,1) both; }
.dg-welcome-dig svg { width: 128px; height: 190px; display: block; }
.dg-welcome .dg-stand { width: 140px; }
.dg-welcome .dg-lead { margin-bottom: 16px; }
.dg-q2 { font-weight: 800; margin: 0 0 10px; }
.dg-personas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.dg-personas button { min-height: 48px; padding: 0 12px; border: 2px solid var(--rule); background: var(--card); color: var(--ink); font: inherit; font-size: 14px; font-weight: 600; text-align: start; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: transform .12s, box-shadow .12s; }
.dg-personas button:hover { transform: translate(-2px, -2px); box-shadow: 3px 3px 0 var(--rule); }
.dg-personas button[aria-pressed="true"] { background: var(--lime); color: #12121a; border-color: #12121a; }
.dg-persona-line { min-height: 1.5em; margin: 10px 0 14px; font-weight: 700; color: var(--cobalt-accent); }
.dg-go { min-height: 52px; font-size: 16px; padding: 0 26px; }

/* ── The map ─────────────────────────────────────────────────────────── */
.dg-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.dg-area {
  display: flex; flex-direction: column; gap: 6px; min-height: 172px; padding: 16px; text-align: start; cursor: pointer;
  border: 2px solid var(--rule); background: var(--card); color: var(--ink); font: inherit; box-shadow: 4px 4px 0 var(--rule);
  transition: transform .12s, box-shadow .12s; animation: dgEnter .4s ease backwards; animation-delay: var(--d);
}
.dg-area:hover { transform: translate(-3px, -3px) rotate(-.6deg); box-shadow: 7px 7px 0 var(--rule); }
.dg-area strong { font-family: ${DISPLAY}; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
.dg-area > span:not(.dg-area-emoji) { font-size: 13.5px; color: var(--ink-soft); line-height: 1.45; }
.dg-area small { margin-top: auto; font-weight: 800; font-size: 12px; color: var(--cobalt-accent); }
.dg-area.seen small { color: var(--ok-text); }
.dg-area-emoji { font-size: 30px; line-height: 1; }
.dg-area:hover .dg-area-emoji { animation: dgWiggle .5s ease; }
.dg-terms { display: flex; flex-wrap: wrap; gap: 8px; }
.dg-term { position: relative; min-height: 44px; padding: 0 16px; border: 2px solid var(--rule); background: var(--paper-alt); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
.dg-term:not(.seen)::after { content: ''; position: absolute; top: -5px; right: -5px; width: 10px; height: 10px; border-radius: 50%; background: var(--cobalt-accent); animation: dgPulse 1.6s ease-in-out infinite; }
.dg-term[aria-expanded="true"] { background: var(--lime); color: #12121a; border-color: #12121a; }

/* ── What is it: Pro steering ────────────────────────────────────────── */
.dg-locked, .dg-steer { margin-top: 14px; padding-top: 14px; border-top: 1.5px dashed color-mix(in srgb, var(--paper) 40%, transparent); }
.dg-locked { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 14px; }
.dg-pro-tag { background: var(--lime); color: #12121a; font-size: 10.5px; font-weight: 800; letter-spacing: .12em; padding: 3px 7px; border: 1.5px solid #12121a; }
.dg-faint-light { margin: 0 0 8px; font-size: 13.5px; opacity: .8; }
.dg-focus p.dg-steer-label { margin: 12px 0 6px; font-size: 11px; font-weight: 800; letter-spacing: .14em; color: var(--dg-ink-accent); text-transform: uppercase; }
.dg-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dg-pills button { min-height: 36px; padding: 0 12px; border: 1.5px solid color-mix(in srgb, var(--paper) 50%, transparent); background: transparent; color: var(--paper); font: inherit; font-size: 13px; cursor: pointer; }
.dg-pills button[aria-pressed="true"] { background: var(--lime); color: #12121a; border-color: var(--lime); }
@media (pointer: coarse) { .dg-pills button { min-height: 44px; } }

/* ── Report extras: the team, the teammate's cursor, notes ───────────── */
.dg-team { display: flex; align-items: center; gap: 8px; margin-inline-start: auto; flex-wrap: wrap; }
.dg-avatar { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; border: 2px solid var(--rule); border-radius: 50%; }
.dg-avatar.you { background: var(--cobalt); color: #ffffff; font-size: 9px; }
.dg-avatar.sam { background: var(--lime); color: #12121a; opacity: .45; transition: opacity .3s, box-shadow .3s; }
.dg-avatar.sam.live { opacity: 1; box-shadow: 0 0 0 3px color-mix(in srgb, var(--lime) 55%, transparent); }
.dg-report { position: relative; }
.dg-cursor { position: absolute; z-index: 5; top: 10px; right: 14px; display: flex; align-items: flex-start; gap: 2px; pointer-events: none; animation: dgSam 1.9s cubic-bezier(.45,.05,.3,1) forwards; }
.dg-cursor span { background: var(--lime); color: #12121a; font-size: 11px; font-weight: 800; padding: 3px 7px; border: 1.5px solid #12121a; margin-top: 14px; white-space: nowrap; }
.dg-insight h4 { margin: 4px 0 8px; font-family: ${DISPLAY}; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.dg-insight.flash { animation: dgFlash 1.3s ease; }
.dg-notes { border-top: 2px solid var(--rule); margin-top: 20px; padding-top: 16px; }
.dg-qnote { display: grid; gap: 4px; padding: 12px 14px; border-inline-start: 4px solid var(--lime); background: var(--paper-alt); margin-bottom: 10px; animation: dgEnter .35s ease backwards; }
.dg-qnote strong { font-size: 14px; }
.dg-qnote span { font-size: 14px; color: var(--ink-soft); line-height: 1.55; }
.dg-qnote .dg-btn { justify-self: start; }

/* ── Ask extras ──────────────────────────────────────────────────────── */
.dg-msg-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.dg-msg-foot .dg-src { margin-top: 0; }
.dg-added { font-size: 12px; font-weight: 700; color: var(--ok-text); }
.dg-quota { font-size: 12px; color: var(--ink-faint); align-self: center; white-space: nowrap; }

/* ── Free or Pro ─────────────────────────────────────────────────────── */
.dg-switch { position: relative; display: inline-grid; grid-template-columns: 1fr 1fr; border: 2px solid var(--rule); background: var(--card); margin-bottom: 18px; }
.dg-switch button { position: relative; z-index: 1; min-width: 110px; min-height: 48px; border: none; background: transparent; font: inherit; font-family: ${DISPLAY}; font-size: 17px; font-weight: 800; color: var(--ink); cursor: pointer; transition: color .3s; }
.dg-switch button[aria-pressed="true"] { color: #12121a; }
.dg-switch-knob { position: absolute; top: 0; bottom: 0; left: 0; width: 50%; background: var(--lime); transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
.dg-plancard { border: 2px solid var(--rule); background: var(--card); box-shadow: 6px 6px 0 var(--rule); padding: clamp(18px, 2.6vw, 28px); transition: box-shadow .3s; }
.dg-plancard.pro { box-shadow: 6px 6px 0 var(--cobalt-accent); }
.dg-price { display: flex; align-items: baseline; gap: 8px; margin-bottom: 18px; }
.dg-price strong { font-family: ${DISPLAY}; font-size: 52px; font-weight: 800; letter-spacing: -0.05em; animation: dgPopIn .45s cubic-bezier(.34,1.56,.64,1); }
.dg-price span { color: var(--ink-faint); }
.dg-meters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.dg-pmeter { border: 2px solid var(--rule); padding: 12px; background: var(--paper-alt); display: flex; flex-direction: column; gap: 4px; }
.dg-pmeter > span:first-child { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
.dg-pmeter strong { font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; }
.dg-pmeter-track { height: 8px; border: 1.5px solid var(--rule); background: var(--card); margin-top: 4px; }
.dg-pmeter-track span { display: block; height: 100%; background: var(--cobalt-accent); transition: width .6s cubic-bezier(.34,1.56,.64,1); }
.dg-features { list-style: none; margin: 0 0 20px; padding: 0; display: grid; gap: 8px; }
.dg-features li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; transition: opacity .3s; }
.dg-features li.no { opacity: .55; }
.dg-features li small { color: var(--ink-faint); }
.dg-mark { width: 24px; flex-shrink: 0; text-align: center; font-weight: 800; color: var(--ok-text); }
.dg-features li.has .dg-mark { animation: dgPopIn .4s cubic-bezier(.34,1.56,.64,1); }

/* ── Files extras ────────────────────────────────────────────────────── */
.dg-plan.locked { color: var(--warn-text); }
.dg-recap { margin-top: 24px; border: 2px solid var(--rule); background: var(--paper-alt); padding: 18px 20px; }
.dg-recap ul { margin: 0 0 10px; padding-inline-start: 20px; line-height: 1.75; font-size: 15px; }

@keyframes dgCoach { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 5px); } }
@keyframes dgTap { 0%, 100% { transform: none; } 50% { transform: translateY(-3px) rotate(-8deg); } }
@keyframes dgRing { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lime) 90%, transparent); } 100% { box-shadow: 0 0 0 14px transparent; } }
@keyframes dgNudge { 0%, 100% { transform: none; } 50% { transform: translateX(5px); } }
@keyframes dgSpin { to { transform: rotate(360deg); } }
@keyframes dgPopUp { from { transform: translateY(115%); } to { transform: none; } }
@keyframes dgWalkIn { 0% { transform: translateX(-240px); opacity: 0; } 25% { opacity: 1; } 100% { transform: none; } }
@keyframes dgWiggle { 0%, 100% { transform: none; } 30% { transform: rotate(-12deg); } 60% { transform: rotate(10deg); } }
@keyframes dgSam { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 70% { transform: translate(-220px, 760px); } 85% { transform: translate(-232px, 748px); } 100% { transform: translate(-226px, 754px); } }
@keyframes dgDrop { from { transform: translateY(-130%); } to { transform: none; } }
@keyframes dgFlash { 0% { background: color-mix(in srgb, var(--lime) 55%, transparent); } 100% { background: transparent; } }

@media (max-width: 860px) {
  .dg-guide { grid-template-areas: "dig say" "nav nav" "extra extra"; }
  .dg-skip, .dg-side-cta { grid-area: extra; justify-self: center; }
  .dg-work { padding-bottom: 240px; }
  /* On a phone DIG is already in the bar at the bottom, so the pop-in drops
     from the top as a plain note. */
  .dg-pop-zone { top: 12px; bottom: auto; left: 12px; right: 12px; }
  .dg-pop { max-width: none; animation-name: dgDrop; }
  .dg-pop-bubble { flex: 1; margin-bottom: 0; }
  .dg-pop-bubble::after, .dg-pop-dig { display: none; }
  .dg-meters { grid-template-columns: minmax(0, 1fr); }
  .dg-team { margin-inline-start: 0; }
  .dg-welcome-card { grid-template-columns: minmax(0, 1fr); text-align: center; }
  .dg-welcome-dig svg { width: 76px; height: 112px; }
  .dg-welcome .dg-stand { width: 90px; }
  .dg-go { width: 100%; }
}
@media (max-width: 640px) {
  .dg-personas { grid-template-columns: minmax(0, 1fr); }
  .dg-ba-box { min-width: 0; flex: 1 1 140px; }
  .dg-ba-arrow { display: none; }
  .dg-cursor { display: none; }
  .dg-type { flex-wrap: wrap; }
}

/* ── Work together: the report open for a team ───────────────────────── */
.dg-live { border: 2px solid var(--rule); box-shadow: 6px 6px 0 var(--rule); background: var(--card); min-width: 0; }
.dg-live-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 10px 14px; border-bottom: 2px solid var(--rule); background: var(--paper-alt); }
.dg-live-doc-icon { width: 22px; height: 28px; flex-shrink: 0; background: var(--cobalt); border: 2px solid var(--rule); clip-path: polygon(0 0, 68% 0, 100% 26%, 100% 100%, 0 100%); }
.dg-live-name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 220px; }
.dg-live-name strong { font-family: ${DISPLAY}; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg-live-name span { font-size: 12px; color: var(--ink-faint); }
.dg-live-faces { display: flex; align-items: center; }
.dg-live-faces .dg-mate + .dg-mate { margin-inline-start: -8px; }
.dg-mate {
  width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: var(--c); color: var(--on); border: 2px solid var(--card); box-shadow: 0 0 0 1.5px var(--rule);
  font-size: 11px; font-weight: 800; animation: dgPop .35s ease backwards;
}
.dg-mate.small { width: 22px; height: 22px; font-size: 9px; border-width: 1.5px; box-shadow: none; }
.dg-live-lock { font-size: 12px; font-weight: 700; color: var(--ink-soft); border: 1.5px solid var(--line); padding: 3px 8px; white-space: nowrap; }
.dg-live-team { list-style: none; margin: 0; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 8px; border-bottom: 2px solid var(--rule); }
.dg-live-team li { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 5px; border: 1.5px solid var(--line); background: var(--paper); transition: opacity .3s, border-color .3s; }
.dg-live-team li.live { border-color: var(--rule); }
.dg-live-team li.out { opacity: .5; }
.dg-live-team li.away { opacity: .62; }
.dg-live-who { display: flex; flex-direction: column; line-height: 1.2; }
.dg-live-who strong { font-size: 13px; }
.dg-live-team small { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-faint); margin-inline-start: 4px; white-space: nowrap; }
.dg-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-faint); flex-shrink: 0; }
.dg-live-team li.live .dg-live-dot { background: var(--ok); animation: dgLive 1.8s ease infinite; }
.dg-role { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--cobalt-accent); }
.dg-live-main { display: grid; grid-template-columns: minmax(0, 1fr) 260px; }
.dg-live-page { padding: clamp(16px, 3vw, 32px); background: var(--paper); border-inline-end: 2px solid var(--rule); min-width: 0; }
.dg-live-title { margin: 0 0 10px; font-size: clamp(20px, 2.6vw, 28px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
.dg-live-summary { margin: 0 0 16px; font-size: 14.5px; line-height: 1.7; color: var(--ink-soft); }
.dg-sel { background: transparent; color: inherit; transition: background .3s, box-shadow .3s; }
.dg-sel.on { background: color-mix(in srgb, var(--c) 42%, transparent); box-shadow: inset 0 -3px 0 var(--c); color: var(--ink); }
.dg-caret { position: relative; display: inline-block; width: 2px; height: 1.25em; margin: 0 1px; vertical-align: text-bottom; }
.dg-caret::before { content: ""; position: absolute; inset: 0; background: var(--c); box-shadow: 0 0 0 .5px var(--rule); animation: dgCaret 1.1s steps(1) infinite; }
.dg-caret b {
  position: absolute; bottom: 100%; left: -1px; z-index: 2; padding: 1px 6px; white-space: nowrap;
  background: var(--c); color: var(--on); border: 1px solid var(--rule); font-family: ${SANS}; font-size: 10.5px; font-weight: 800; line-height: 1.35; letter-spacing: 0;
}
.dg-live-f { padding: 14px 0 12px; border-top: 1.5px solid var(--line); }
.dg-live-f.flash { animation: dgFlash 1.4s ease; }
.dg-live-f h4 { margin: 0 0 6px; font-family: ${DISPLAY}; font-size: 17px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.25; }
.dg-live-f p { margin: 0; font-size: 14px; line-height: 1.65; color: var(--ink-soft); }
.dg-live-n { color: var(--cobalt-accent); margin-inline-end: 4px; }
.dg-typed { background: color-mix(in srgb, var(--c) 34%, transparent); color: var(--ink); }
.dg-live-more { margin: 6px 0 0; font-size: 12.5px; font-weight: 700; color: var(--ink-faint); }
.dg-live-side { padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; background: var(--card); }
.dg-live-side .dg-eyebrow { margin: 4px 0 0; }
.dg-live-empty { margin: 0; font-size: 13px; color: var(--ink-faint); }
.dg-thread { border: 2px solid var(--rule); background: var(--paper); padding: 10px; display: flex; flex-direction: column; gap: 10px; animation: dgEnter .3s ease backwards; }
.dg-thread q { font-size: 12px; font-style: italic; color: var(--ink-faint); border-inline-start: 3px solid #7B5EA7; padding-inline-start: 8px; }
.dg-cmt { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; animation: dgEnter .3s ease backwards; }
.dg-cmt-text { display: block; margin-top: 2px; line-height: 1.45; color: var(--ink); }
.dg-live-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow: auto; }
.dg-live-log li { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; line-height: 1.4; color: var(--ink-soft); animation: dgEnter .3s ease backwards; }
.dg-live-log small { color: var(--ink-faint); }
.dg-live-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 20px; }
.dg-live-rolecard { display: flex; flex-direction: column; gap: 4px; border: 2px solid var(--rule); background: var(--paper-alt); padding: 10px 12px; font-size: 13px; line-height: 1.45; color: var(--ink-soft); }
.dg-live-again { margin-top: 14px; }
@keyframes dgCaret { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
@keyframes dgLive { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 55%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
@media (max-width: 860px) {
  .dg-live-main { grid-template-columns: minmax(0, 1fr); }
  .dg-live-page { border-inline-end: none; border-bottom: 2px solid var(--rule); }
}
@media (max-width: 640px) {
  .dg-live-team li { flex: 1 1 100%; }
  .dg-live-team small { margin-inline-start: auto; }
  .dg-live-name strong { white-space: normal; }
}

/* Short screens: the header scrolls away so the work has room, and DIG
   sticks near the top instead of under it. */
.dg-work { scroll-margin-top: 16px; }
@media (max-width: 860px) { .dg-top { position: relative; } }
@media (min-width: 861px) and (max-height: 860px) {
  .dg-top { position: relative; }
  .dg-guide { top: 16px; }
}
@media (min-width: 861px) and (min-height: 861px) {
  .dg-work { scroll-margin-top: 180px; }
}

@media (prefers-reduced-motion: reduce) {
  .dg-page *, .dg-page *::before, .dg-page *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important;
  }
  .dg-confetti { display: none; }
}
`;
