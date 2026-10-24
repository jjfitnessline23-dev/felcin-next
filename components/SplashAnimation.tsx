"use client";

// Launch splash: on a cold app open (once per session), overlay the animated Felcin
// logo — the ghost fades in, the heartbeat line draws across, the wordmark appears —
// then the whole thing fades into the app. Native app loads the remote site, so this
// plays right after the Capacitor native splash hides.

import { useEffect, useState } from "react";

const EKG = "M 40,560 L 316,560 L 338,538 L 356,560 L 386,560 L 404,580 L 432,250 L 458,598 L 480,544 L 508,560 C 528,560 530,494 552,560 L 984,560";

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
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
      background: "linear-gradient(180deg,#140e26 0%,#0b0814 55%,#070509 100%)",
      opacity: fading ? 0 : 1, transition: "opacity 0.55s ease", pointerEvents: fading ? "none" : "auto",
      paddingTop: "env(safe-area-inset-top,0px)",
    }}>
      <svg className="fx-splash-svg" width="132" height="132" viewBox="0 0 1024 1024">
        <circle cx="512" cy="470" r="360" fill="#7c3aed" opacity="0.16" className="fx-splash-glow" />
        {/* Ghost */}
        <path d="M 302 452 A 210 210 0 0 1 722 452 L 722 668 Q 652 748 582 668 Q 512 748 442 668 Q 372 748 302 668 Z" fill="#ffffff" />
        <circle cx="416" cy="402" r="50" fill="#0b0814" />
        <circle cx="608" cy="402" r="50" fill="#0b0814" />
        <circle cx="432" cy="386" r="15" fill="#ffffff" />
        <circle cx="624" cy="386" r="15" fill="#ffffff" />
        {/* Heartbeat — drawn on */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={EKG} stroke="#6d28d9" strokeWidth="30" opacity="0.38" className="fx-splash-ekg" pathLength={1} />
          <path d={EKG} stroke="#a855f7" strokeWidth="15" className="fx-splash-ekg" pathLength={1} />
          <path d={EKG} stroke="#f3e8ff" strokeWidth="5" opacity="0.9" className="fx-splash-ekg" pathLength={1} />
        </g>
      </svg>
      <span className="fx-splash-word" style={{
        fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px",
        background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-2))",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
      }}>Felcin</span>

      <style>{`
        .fx-splash-svg { opacity: 0; transform: scale(0.86); animation: fxSvgIn 0.6s cubic-bezier(.2,.8,.2,1) 0.1s forwards; }
        .fx-splash-glow { animation: fxGlow 1.6s ease 0.5s infinite alternate; }
        .fx-splash-ekg { stroke-dasharray: 1; stroke-dashoffset: 1; animation: fxDraw 0.95s ease 0.5s forwards; }
        .fx-splash-word { opacity: 0; transform: translateY(6px); animation: fxWordIn 0.5s ease 0.95s forwards; }
        @keyframes fxSvgIn { to { opacity: 1; transform: scale(1); } }
        @keyframes fxDraw { to { stroke-dashoffset: 0; } }
        @keyframes fxWordIn { to { opacity: 1; transform: translateY(0); } }
        @keyframes fxGlow { from { opacity: 0.12; } to { opacity: 0.26; } }
      `}</style>
    </div>
  );
}
