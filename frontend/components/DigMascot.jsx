// @ts-nocheck
"use client";

/**
 * DigMascot — DIG's tiny kawaii data-scientist mascot
 * ────────────────────────────────────────────────────
 * Animation phases (loops ~13s):
 *   idle       → breathe + gentle sway
 *   walk-right → legs swing, body bobs
 *   arrive     → squash-bounce stop
 *   look       → head rotates left/right, thinking bubble
 *   examine    → lean forward, glass sweeps, tiny chart in lens
 *   found      → excited jump, stars, big smile
 *   turn       → flip direction
 *   walk-left  → same back
 *
 * Tooltip: always visible, appears ABOVE by default.
 * If near the top of viewport the tooltip auto-flips BELOW.
 * Uses z-index: 9999 so it's never clipped.
 *
 * Props:
 *   stageWidth  (number, optional) — override horizontal range in px.
 *               If omitted, the component self-measures its container via
 *               ResizeObserver so DIG always uses the full available width.
 */

import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/app/contexts/SettingsContext";

const DIG_T = {
  en: { hi: "👋 Hi! I'm DIG", sub: "Your AI data-analysis assistant", think: "🤔 ?" },
  fr: { hi: "👋 Salut ! Je suis DIG", sub: "Votre assistant d'analyse de données IA", think: "🤔 ?" },
  fa: { hi: "👋 سلام! من DIG هستم", sub: "دستیار هوش مصنوعی تحلیل داده شما", think: "🤔 ؟" },
};

// ── Phase durations (ms) ─────────────────────────────────────────────────────
const D = {
  idle:    900,
  walkR:   3400,
  arriveR: 380,
  lookR:   1050,
  examR:   2700,
  foundR:  560,
  turnL:   300,
  walkL:   3400,
  arriveL: 380,
  lookL:   1050,
  examL:   2700,
  foundL:  560,
  turnR:   300,
};

const SEQ = [
  "idle","walkR","arriveR","lookR","examR","foundR","turnL",
  "walkL","arriveL","lookL","examL","foundL","turnR",
];

export default function DigMascot({ stageWidth: propStageWidth = undefined }) {
  const CHAR_W = 54;
  const MIN_W  = CHAR_W + 20;

  const { lang } = useSettings();
  const dt = DIG_T[lang] || DIG_T.en;

  // ── Responsive stage width ─────────────────────────────────────────────────
  const containerRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(propStageWidth ?? 320);

  useEffect(() => {
    if (propStageWidth != null) {
      setStageWidth(Math.max(propStageWidth, MIN_W));
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const update = (w) => setStageWidth(Math.max(w, MIN_W));

    // Set immediately on mount
    update(el.offsetWidth);

    const ro = new ResizeObserver(entries => {
      for (const e of entries) update(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [propStageWidth]);

  const MAX_X = stageWidth - CHAR_W - 8;

  const [phase,     setPhase]     = useState("idle");
  const [x,         setX]         = useState(0);
  const [dir,       setDir]       = useState(1);
  const [hovered,   setHovered]   = useState(false);
  const [tooltipUp, setTooltipUp] = useState(true);
  const wrapRef  = useRef(null);
  const timerRef = useRef(null);

  // ── Clamp x when stage resizes to prevent DIG walking off-screen ───────────
  useEffect(() => {
    setX(prev => Math.min(prev, MAX_X));
  }, [MAX_X]);

  // ── State machine ─────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(timerRef.current);
    const advance = () =>
      setPhase(p => SEQ[(SEQ.indexOf(p) + 1) % SEQ.length]);

    if (phase === "walkR")  { setDir(1);  setX(MAX_X); }
    if (phase === "walkL")  { setDir(-1); setX(0);     }
    if (phase === "turnL")  setDir(-1);
    if (phase === "turnR")  setDir(1);

    timerRef.current = setTimeout(advance, D[phase] ?? 500);
    return () => clearTimeout(timerRef.current);
  }, [phase, MAX_X]);

  // ── Auto-flip tooltip up vs down based on viewport position ───────────────
  useEffect(() => {
    if (!hovered || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setTooltipUp(rect.top > 110); // flip below when within 110px of viewport top
  }, [hovered]);

  // ── Derived states ────────────────────────────────────────────────────────
  const walking   = phase === "walkR"   || phase === "walkL";
  const arriving  = phase === "arriveR" || phase === "arriveL";
  const looking   = phase === "lookR"   || phase === "lookL";
  const examining = phase === "examR"   || phase === "examL";
  const found     = phase === "foundR"  || phase === "foundL";
  const idle      = phase === "idle";

  const bodyRotate = examining ? 20 : 0;
  const bodyTransY = examining ? 5  : 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width:    "100%",          /* always fill the parent container */
        height:   "82px",
        pointerEvents: "all",
        flexShrink: 0,
        overflow: "visible",       /* tooltip must never be clipped */
      }}
    >
      {/* ── Position layer (X) ── */}
      <div
        ref={wrapRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          transform: `translateX(${x}px)`,
          transition: walking
            ? `transform ${D.walkR}ms linear`
            : arriving
            ? `transform ${D.arriveR}ms cubic-bezier(.36,.07,.19,.97)`
            : "none",
          width: `${CHAR_W}px`,
          zIndex: 9999,
        }}
      >
        {/* ── Direction flip ── */}
        <div
          style={{
            transform: `scaleX(${dir})`,
            transformOrigin: `${CHAR_W / 2}px center`,
            transition: "transform 0.25s ease",
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* ── Tooltip (always on top, direction-aware) ── */}
          <div style={{
            position: "absolute",
            ...(tooltipUp
              ? { bottom: "84px" }
              : { top:    "84px" }),
            left: "50%",
            transform: `translateX(-50%) scaleX(${dir})`,
            background: "linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,27,75,0.97))",
            color: "#e2e8f0",
            padding: "8px 14px",
            borderRadius: "13px",
            fontSize: "0.71rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            border: "1px solid rgba(99,102,241,0.6)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 6px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
            pointerEvents: "none",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.22s",
            zIndex: 9999,
            minWidth: "160px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "0.78rem", marginBottom: "2px" }}>{dt.hi}</div>
            <div style={{ color: "#a5b4fc", fontSize: "0.63rem", fontWeight: 500 }}>
              {dt.sub}
            </div>
            {/* Arrow */}
            <div style={{
              position: "absolute",
              ...(tooltipUp
                ? { bottom: "-6px", borderTop:    "6px solid rgba(99,102,241,0.6)", borderBottom: "none" }
                : { top:    "-6px", borderBottom: "6px solid rgba(99,102,241,0.6)", borderTop:    "none" }),
              left: "50%",
              transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft:  "6px solid transparent",
              borderRight: "6px solid transparent",
            }}/>
          </div>

          {/* ── Thinking bubble during look phase ── */}
          <div style={{
            position: "absolute",
            bottom: "72px",
            left: "30px",
            transform: `scaleX(${dir})`,
            opacity: looking ? 1 : 0,
            transition: "opacity 0.3s",
            pointerEvents: "none",
            fontSize: "0.7rem",
            background: "rgba(30,27,75,0.88)",
            border: "1px solid rgba(99,102,241,0.5)",
            borderRadius: "10px 10px 10px 2px",
            padding: "3px 8px",
            color: "#c7d2fe",
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
          }}>
            {dt.think}
            <div style={{
              position:"absolute", bottom:"-4px", left:"4px",
              width:"5px", height:"5px",
              borderRadius:"50%",
              background:"rgba(30,27,75,0.88)",
              border:"1px solid rgba(99,102,241,0.5)",
            }}/>
          </div>

          {/* ── "Found it!" flash particles ── */}
          {found && (
            <div style={{
              position:"absolute", bottom:"60px", left:"-8px",
              pointerEvents:"none", zIndex:10,
            }}>
              <div className="dig-particle" style={{ "--dx":"18px","--dy":"-22px","--c":"#fbbf24" }}>✦</div>
              <div className="dig-particle" style={{ "--dx":"-14px","--dy":"-18px","--c":"#f472b6","--d":"0.07s" }}>✦</div>
              <div className="dig-particle" style={{ "--dx":"24px","--dy":"-10px","--c":"#34d399","--d":"0.04s" }}>•</div>
              <div className="dig-particle" style={{ "--dx":"-6px","--dy":"-26px","--c":"#a5b4fc","--d":"0.1s"  }}>★</div>
            </div>
          )}

          {/* ── Body layer (bob / arrive / lean) ── */}
          <div
            className={[
              walking   ? "dig-bob"    : "",
              arriving  ? "dig-arrive" : "",
              found     ? "dig-found"  : "",
              idle      ? "dig-idle"   : "",
            ].join(" ")}
            style={{
              transformOrigin: "50% 85%",
              transform: `rotate(${bodyRotate}deg) translateY(${bodyTransY}px)`,
              transition: "transform 0.42s cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            <svg width={CHAR_W} height="80" viewBox="0 0 54 80" fill="none" xmlns="http://www.w3.org/2000/svg">

              {/* Shadow */}
              <ellipse cx="25" cy="78" rx="13" ry="2.5" fill="rgba(0,0,0,0.12)" />

              {/* Left leg */}
              <line x1="20" y1="60" x2="15" y2="70" stroke="#c8a060" strokeWidth="3.2" strokeLinecap="round"
                className={walking ? "dig-leg-l" : ""} />
              {/* Right leg */}
              <line x1="29" y1="60" x2="34" y2="70" stroke="#c8a060" strokeWidth="3.2" strokeLinecap="round"
                className={walking ? "dig-leg-r" : ""} />

              {/* Body */}
              <ellipse cx="24.5" cy="46" rx="13.5" ry="15" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.5" />

              {/* Left arm */}
              <path d={examining ? "M12 42 Q5 50 9 58" : "M12 42 Q7 48 11 54"}
                stroke="#d4a85a" strokeWidth="2.4" strokeLinecap="round" fill="none"
                style={{ transition: "d 0.4s ease" }} />
              <circle cx={examining ? 9.5 : 11.5} cy={examining ? 57.5 : 54}
                r="2.4" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3"
                style={{ transition: "cx 0.4s, cy 0.4s" }} />

              {/* Right arm */}
              <path d={examining ? "M36 40 Q45 42 44 52" : "M36 38 Q43 42 42 50"}
                stroke="#d4a85a" strokeWidth="2.4" strokeLinecap="round" fill="none"
                style={{ transition: "d 0.4s ease" }} />

              {/* ── Magnifying glass group ── */}
              <g className={examining ? "dig-glass-search" : found ? "dig-glass-lift" : ""}
                style={{ transformOrigin: "44px 52px" }}>
                {/* Lens */}
                <circle cx="44" cy={examining ? 57 : 52} r="6"
                  fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="1.8"
                  style={{ transition: "cy 0.4s ease" }} />
                {/* Mini bar-chart inside lens while examining */}
                {examining && (
                  <g opacity="0.7">
                    <rect x="41" y="55" width="1.8" height="3" rx="0.5" fill="#6366f1"/>
                    <rect x="43.3" y="53.5" width="1.8" height="4.5" rx="0.5" fill="#818cf8"/>
                    <rect x="45.6" y="54.8" width="1.8" height="3.2" rx="0.5" fill="#6366f1"/>
                  </g>
                )}
                {/* Lens glare */}
                <path d={`M40.5 ${examining ? 54 : 49} Q42 ${examining ? 52.5 : 47.5} 44 ${examining ? 53 : 48}`}
                  stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" fill="none"
                  style={{ transition: "d 0.4s ease" }} />
                {/* Handle */}
                <line x1="48.8" y1={examining ? 61.5 : 56.5} x2="52" y2={examining ? 65 : 60}
                  stroke="#6366f1" strokeWidth="2.4" strokeLinecap="round"
                  style={{ transition: "y1 0.4s, y2 0.4s" }} />
              </g>

              {/* ── Head group ── */}
              <g className={looking ? "dig-head-look" : ""}>
                {/* Ears */}
                <circle cx="10.5" cy="24" r="4.2" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />
                <circle cx="38.5" cy="24" r="4.2" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.3" />
                {/* Head */}
                <circle cx="24" cy="23" r="14.5" fill="#fef3c7" stroke="#d4a85a" strokeWidth="1.5" />

                {/* Eyes */}
                <circle cx="19" cy="21" r="4.4" fill="white" />
                <circle cx="29" cy="21" r="4.4" fill="white" />
                {/* Pupils — shift direction during looking */}
                <circle cx={looking ? 20 : 19} cy="21.5" r="2.6" fill="#1a1a2e"
                  style={{ transition: "cx 0.3s ease" }}/>
                <circle cx={looking ? 30 : 29} cy="21.5" r="2.6" fill="#1a1a2e"
                  style={{ transition: "cx 0.3s ease" }}/>
                {/* Shine */}
                <circle cx="20.2" cy="20" r="1.15" fill="white" />
                <circle cx="30.2" cy="20" r="1.15" fill="white" />

                {/* Squint line during examine */}
                {examining && (
                  <>
                    <line x1="15" y1="19" x2="23.5" y2="19" stroke="#1a1a2e" strokeWidth="1.3" strokeLinecap="round"/>
                    <line x1="25" y1="19" x2="33.5" y2="19" stroke="#1a1a2e" strokeWidth="1.3" strokeLinecap="round"/>
                  </>
                )}

                {/* Cheeks */}
                <circle cx="13.5" cy="26" r="3.4" fill="#f9a8d4" opacity="0.38" />
                <circle cx="34.5" cy="26" r="3.4" fill="#f9a8d4" opacity="0.38" />

                {/* Glasses */}
                <rect x="12.2" y="15.5" width="11" height="9.5" rx="4.8"
                  fill="none" stroke="#6366f1" strokeWidth="1.45" />
                <rect x="24.4" y="15.5" width="11" height="9.5" rx="4.8"
                  fill="none" stroke="#6366f1" strokeWidth="1.45" />
                <line x1="23.2" y1="20" x2="24.4" y2="20" stroke="#6366f1" strokeWidth="1.45" />
                <line x1="12.2" y1="20" x2="9.2"  y2="19.5" stroke="#6366f1" strokeWidth="1.2" />
                <line x1="35.4" y1="20" x2="38.4" y2="19.5" stroke="#6366f1" strokeWidth="1.2" />

                {/* Mouth */}
                <path
                  d={found ? "M19 29.5 Q24 34.5 29 29.5" : examining ? "M20 29 Q24 31 28 29" : "M19 29 Q24 32.5 29 29"}
                  fill="none" stroke="#d4a85a" strokeWidth="1.35" strokeLinecap="round"
                  style={{ transition: "d 0.35s ease" }}
                />

                {/* Sweat drop (animate slide down during examine) */}
                <path
                  d="M38 14 Q39.5 10 38 7.5 Q36.5 10 38 14Z"
                  fill="#93c5fd" opacity={examining ? 0.75 : 0}
                  style={{ transition: "opacity 0.3s", transform: examining ? "translateY(0)" : "translateY(-4px)" }}
                />

                {/* Found sparkles */}
                {found && (
                  <>
                    <text x="2"  y="11" fontSize="8" fill="#fbbf24">✦</text>
                    <text x="38" y="9"  fontSize="7" fill="#f472b6">✦</text>
                    <text x="20" y="5"  fontSize="6" fill="#a5b4fc">★</text>
                  </>
                )}
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Keyframe animations ─────────────────────────────────────────────── */}
      <style>{`
        /* ── Bob (walking) ── */
        @keyframes digBobK {
          0%, 100% { transform: translateY(0); }
          25%, 75% { transform: translateY(-5px); }
          50%       { transform: translateY(0); }
        }
        .dig-bob { animation: digBobK 0.52s ease-in-out infinite; }

        /* ── Idle breathe ── */
        @keyframes digIdleK {
          0%, 100% { transform: scale(1) translateY(0); }
          40%       { transform: scale(1.025,0.975) translateY(1px); }
          70%       { transform: scale(0.975,1.02) translateY(-1px); }
        }
        .dig-idle {
          animation: digIdleK 2.2s ease-in-out infinite;
          transform-origin: 50% 90%;
        }

        /* ── Arrive squash ── */
        @keyframes digArriveK {
          0%   { transform: scaleY(1)    scaleX(1); }
          28%  { transform: scaleY(0.78) scaleX(1.22); }
          58%  { transform: scaleY(1.14) scaleX(0.9); }
          80%  { transform: scaleY(0.96) scaleX(1.04); }
          100% { transform: scaleY(1)    scaleX(1); }
        }
        .dig-arrive {
          animation: digArriveK 380ms cubic-bezier(.36,.07,.19,.97) 1;
          transform-origin: 50% 100%;
        }

        /* ── Head look ── */
        @keyframes digHeadLookK {
          0%   { transform: rotate(0deg); }
          22%  { transform: rotate(-14deg); }
          55%  { transform: rotate(16deg); }
          80%  { transform: rotate(-7deg); }
          100% { transform: rotate(0deg); }
        }
        .dig-head-look {
          animation: digHeadLookK 1050ms ease-in-out 1;
          transform-origin: 24px 23px;
        }

        /* ── Found jump ── */
        @keyframes digFoundK {
          0%   { transform: rotate(0deg)   translateY(0); }
          30%  { transform: rotate(-12deg) translateY(-16px) scale(1.06); }
          60%  { transform: rotate(9deg)   translateY(-7px); }
          82%  { transform: rotate(-4deg)  translateY(-3px); }
          100% { transform: rotate(0deg)   translateY(0); }
        }
        .dig-found {
          animation: digFoundK 560ms cubic-bezier(.34,1.56,.64,1) 1;
          transform-origin: 50% 85%;
        }

        /* ── Leg swing L ── */
        @keyframes digLegLK {
          0%, 100% { transform-origin: 20px 60px; transform: rotate(0deg); }
          25%       { transform-origin: 20px 60px; transform: rotate(-20deg); }
          75%       { transform-origin: 20px 60px; transform: rotate(20deg); }
        }
        .dig-leg-l { animation: digLegLK 0.52s ease-in-out infinite; }

        /* ── Leg swing R (opposite) ── */
        @keyframes digLegRK {
          0%, 100% { transform-origin: 29px 60px; transform: rotate(0deg); }
          25%       { transform-origin: 29px 60px; transform: rotate(20deg); }
          75%       { transform-origin: 29px 60px; transform: rotate(-20deg); }
        }
        .dig-leg-r { animation: digLegRK 0.52s ease-in-out infinite; }

        /* ── Glass sweep while examining ── */
        @keyframes digGlassK {
          0%   { transform: rotate(0deg)   translateX(0); }
          22%  { transform: rotate(-20deg) translateX(-3px); }
          55%  { transform: rotate(16deg)  translateX(4px); }
          78%  { transform: rotate(-10deg) translateX(-2px); }
          100% { transform: rotate(0deg)   translateX(0); }
        }
        .dig-glass-search { animation: digGlassK 1.05s ease-in-out infinite; }

        /* ── Glass lift on found ── */
        @keyframes digGlassLiftK {
          0%   { transform: rotate(0deg)   translateY(0); }
          50%  { transform: rotate(-35deg) translateY(-10px) scale(1.1); }
          100% { transform: rotate(-15deg) translateY(-5px); }
        }
        .dig-glass-lift { animation: digGlassLiftK 560ms ease-out 1 forwards; }

        /* ── Floating particles on found ── */
        @keyframes digParticleK {
          0%   { opacity: 1; transform: translate(0,0) scale(1); }
          100% { opacity: 0; transform: translate(var(--dx),var(--dy)) scale(0.5); }
        }
        .dig-particle {
          position: absolute;
          font-size: 0.75rem;
          color: var(--c, #fbbf24);
          animation: digParticleK 560ms ease-out calc(var(--d,0s)) 1 forwards;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
