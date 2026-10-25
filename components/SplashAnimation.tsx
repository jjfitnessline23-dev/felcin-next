"use client";

// Launch splash: on a cold app open (once per session), overlay the ORIGINAL Felcin
// logo (ghost + neon-glow heartbeat, flat dark bg — identical to logo-full.svg) and
// animate it on — the ghost fades in, the heartbeat line draws across — then fade into
// the app. Native app loads the remote site, so this plays after the native splash hides.

import { useEffect, useState } from "react";

const EKG = "M 30,562 L 318,562 L 338,542 L 356,562 L 386,562 L 404,580 L 432,248 L 458,598 L 480,546 L 508,562 C 528,562 530,496 552,562 L 994,562";

export default function SplashAnimation() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("felcin_splash") === "1") return;
      sessionStorage.setItem("felcin_splash", "1");
    } catch { /* ignore */ }
    setShow(true);
    const t1 = setTimeout(() => setFading(true), 1750);
    const t2 = setTimeout(() => setShow(false), 2350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!show) return null;

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 999999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
      background: "#080808",
      opacity: fading ? 0 : 1, transition: "opacity 0.55s ease", pointerEvents: fading ? "none" : "auto",
      paddingTop: "env(safe-area-inset-top,0px)",
    }}>
      {/* Original Felcin logo (logo-full.svg), animated on */}
      <svg className="fx-splash-svg" width="150" height="150" viewBox="0 0 1024 1024">
        <defs>
          <filter id="fxOuterGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="20" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="fxInnerGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <ellipse cx="512" cy="490" rx="280" ry="240" fill="#6d28d9" opacity="0.08" className="fx-splash-glow" />
        <path d="M 302 455 A 210 210 0 0 0 722 455 L 722 672 Q 652 752 582 672 Q 512 752 442 672 Q 372 752 302 672 Z" fill="white" />
        <circle cx="414" cy="406" r="50" fill="#080808" />
        <circle cx="610" cy="406" r="50" fill="#080808" />
        <circle cx="430" cy="390" r="16" fill="white" />
        <circle cx="626" cy="390" r="16" fill="white" />
        <path d={EKG} fill="none" stroke="#7c3aed" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" filter="url(#fxOuterGlow)" opacity="0.6" className="fx-splash-ekg" pathLength={1} />
        <path d={EKG} fill="none" stroke="#a855f7" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#fxInnerGlow)" className="fx-splash-ekg" pathLength={1} />
        <path d={EKG} fill="none" stroke="#f3e8ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" className="fx-splash-ekg" pathLength={1} />
      </svg>
      <span className="fx-splash-word" style={{
        fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px",
        background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-2))",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
      }}>Felcin</span>

      <style>{`
        .fx-splash-svg { opacity: 0; transform: scale(0.88); animation: fxSvgIn 0.6s cubic-bezier(.2,.8,.2,1) 0.1s forwards; }
        .fx-splash-glow { animation: fxGlow 1.6s ease 0.5s infinite alternate; }
        .fx-splash-ekg { stroke-dasharray: 1; stroke-dashoffset: 1; animation: fxDraw 0.95s ease 0.5s forwards; }
        .fx-splash-word { opacity: 0; transform: translateY(6px); animation: fxWordIn 0.5s ease 0.95s forwards; }
        @keyframes fxSvgIn { to { opacity: 1; transform: scale(1); } }
        @keyframes fxDraw { to { stroke-dashoffset: 0; } }
        @keyframes fxWordIn { to { opacity: 1; transform: translateY(0); } }
        @keyframes fxGlow { from { opacity: 0.06; } to { opacity: 0.14; } }
      `}</style>
    </div>
  );
}
