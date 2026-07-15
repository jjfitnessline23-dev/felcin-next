"use client";

import { useEffect, useRef, useState } from "react";

export type GhostVariant = "gold" | "diamond" | "fire" | "champion";

interface Props {
  variant: GhostVariant;
  senderName: string;
  onDone: () => void;
}

const VARIANTS: Record<GhostVariant, {
  primary: string; secondary: string; glow: string;
  flashBg: string; logoFilter: string;
  message: string[]; chordFreqs: number[]; bassFreq: number; boomVol: number; boomHz: number;
}> = {
  gold: {
    primary: "#fbbf24", secondary: "#f59e0b",
    glow: "rgba(251,191,36,0.6)",
    flashBg: "rgba(251,191,36,0.95)",
    logoFilter: "sepia(1) saturate(6) hue-rotate(5deg) brightness(1.4) drop-shadow(0 0 24px rgba(251,191,36,0.9))",
    message: ["You're Live", "with Felcin"],
    chordFreqs: [523, 659, 784, 1047], bassFreq: 55, boomVol: 1.4, boomHz: 120,
  },
  diamond: {
    primary: "#93c5fd", secondary: "#3b82f6",
    glow: "rgba(99,179,237,0.6)",
    flashBg: "rgba(99,179,237,0.95)",
    logoFilter: "hue-rotate(200deg) saturate(4) brightness(1.6) contrast(1.1) drop-shadow(0 0 24px rgba(99,179,237,0.9))",
    message: ["You're Live", "with Felcin"],
    chordFreqs: [220, 277, 370, 554], bassFreq: 40, boomVol: 1.8, boomHz: 70,
  },
  fire: {
    primary: "#f97316", secondary: "#ef4444",
    glow: "rgba(249,115,22,0.65)",
    flashBg: "rgba(239,68,68,0.95)",
    logoFilter: "sepia(1) saturate(8) hue-rotate(-30deg) brightness(1.5) drop-shadow(0 0 24px rgba(239,68,68,0.9))",
    message: ["Train Together", "with the Ghost"],
    chordFreqs: [330, 440, 554, 880], bassFreq: 60, boomVol: 1.6, boomHz: 100,
  },
  champion: {
    primary: "#4ade80", secondary: "#22c55e",
    glow: "rgba(74,222,128,0.65)",
    flashBg: "rgba(34,197,94,0.95)",
    logoFilter: "hue-rotate(100deg) saturate(5) brightness(1.5) drop-shadow(0 0 24px rgba(74,222,128,0.9))",
    message: ["Train Together", "with the Ghost"],
    chordFreqs: [392, 494, 587, 784], bassFreq: 50, boomVol: 1.5, boomHz: 90,
  },
};

function playGhostSound(variant: GhostVariant) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const cfg = VARIANTS[variant];
    const now = ctx.currentTime;

    // BOOM
    const boomBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const boomData = boomBuf.getChannelData(0);
    for (let i = 0; i < boomData.length; i++) {
      boomData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
    }
    const boom = ctx.createBufferSource();
    boom.buffer = boomBuf;
    const boomFilter = ctx.createBiquadFilter();
    boomFilter.type = "lowpass";
    boomFilter.frequency.value = cfg.boomHz;
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(cfg.boomVol, now);
    boom.connect(boomFilter); boomFilter.connect(boomGain); boomGain.connect(ctx.destination);
    boom.start(now);

    // WHOOSH
    const whoosh = ctx.createOscillator();
    whoosh.type = "sine";
    whoosh.frequency.setValueAtTime(cfg.bassFreq, now + 0.05);
    whoosh.frequency.exponentialRampToValueAtTime(cfg.bassFreq * 16, now + 0.7);
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, now + 0.05);
    whooshGain.gain.linearRampToValueAtTime(0.35, now + 0.25);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    whoosh.connect(whooshGain); whooshGain.connect(ctx.destination);
    whoosh.start(now + 0.05); whoosh.stop(now + 0.75);

    // CHORD
    cfg.chordFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now + 0.3);
      g.gain.linearRampToValueAtTime(0.22 - i * 0.04, now + 0.5);
      g.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + 0.3); osc.stop(now + 3.6);
    });

    // SUB BASS
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = cfg.bassFreq;
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.6, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    sub.connect(subGain); subGain.connect(ctx.destination);
    sub.start(now); sub.stop(now + 1.2);

  } catch { /* audio not available */ }
}

export default function GhostGiftReveal({ variant, senderName, onDone }: Props) {
  const [phase, setPhase] = useState<"flash" | "reveal" | "hold" | "out">("flash");
  const cfg = VARIANTS[variant];
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    playGhostSound(variant);
    const t1 = setTimeout(() => setPhase("reveal"), 300);
    const t2 = setTimeout(() => setPhase("hold"),   1200);
    const t3 = setTimeout(() => setPhase("out"),    3800);
    const t4 = setTimeout(() => onDoneRef.current(), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: phase === "flash" ? cfg.flashBg : "rgba(0,0,0,0.92)",
      backdropFilter: "blur(12px)",
      opacity: phase === "out" ? 0 : 1,
      transitionProperty: phase === "out" ? "opacity" : "background",
      transitionDuration: phase === "out" ? "0.7s" : "0.4s",
    }}>
      <style>{`
        @keyframes ghostPop {
          0%   { transform: scale(0.2) rotate(-10deg); opacity: 0; }
          60%  { transform: scale(1.18) rotate(4deg);  opacity: 1; }
          80%  { transform: scale(0.95) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1)    rotate(0deg);  opacity: 1; }
        }
        @keyframes ghostPulse-${variant} {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
        @keyframes textSlide {
          0%   { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes ringPulse { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes shimmer   { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes particleFly { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--tx),var(--ty)) scale(0); opacity: 0; } }
      `}</style>

      {/* Rings */}
      {phase !== "flash" && [0, 0.4, 0.8].map((delay, i) => (
        <div key={i} style={{
          position: "absolute", width: 200, height: 200, borderRadius: "50%",
          border: `2px solid ${cfg.primary}`,
          animation: `ringPulse 1.8s ease-out ${delay}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {/* Particles */}
      {phase !== "flash" && Array.from({ length: 16 }).map((_, i) => {
        const angle = (i / 16) * 360;
        const dist  = 120 + Math.random() * 80;
        const tx    = Math.cos((angle * Math.PI) / 180) * dist;
        const ty    = Math.sin((angle * Math.PI) / 180) * dist;
        const size  = 6 + Math.random() * 8;
        return (
          <div key={i} style={{
            position: "absolute", width: size, height: size, borderRadius: "50%",
            background: i % 2 === 0 ? cfg.primary : cfg.secondary,
            // @ts-expect-error css vars
            "--tx": `${tx}px`, "--ty": `${ty}px`,
            animation: `particleFly 1.2s ease-out ${Math.random() * 0.4}s forwards`,
            pointerEvents: "none",
          }} />
        );
      })}

      {/* Logo */}
      <div style={{
        animation: phase === "flash" ? "none"
          : phase === "hold" ? `ghostPulse-${variant} 1.6s ease-in-out infinite`
          : "ghostPop 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards",
        marginBottom: 28, filter: phase === "flash" ? "none" : cfg.logoFilter, position: "relative",
      }}>
        <img src="/static/logo-nav.svg" alt="Felcin" style={{ width: 140, height: 140, objectFit: "contain", display: "block" }} />
        <div style={{
          position: "absolute", inset: -20, borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${cfg.glow} 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
      </div>

      {/* Message */}
      {phase !== "flash" && (
        <div style={{ textAlign: "center", animation: "textSlide 0.5s ease-out 0.1s both" }}>
          <p style={{
            fontSize: "clamp(1.6rem, 6vw, 2.4rem)", fontWeight: 900,
            letterSpacing: "-0.02em", lineHeight: 1.1,
            background: `linear-gradient(90deg, ${cfg.primary}, #fff, ${cfg.secondary}, #fff, ${cfg.primary})`,
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "shimmer 2s linear infinite", marginBottom: 6,
          }}>
            {cfg.message[0]}<br />{cfg.message[1]}
          </p>
          <div style={{
            width: 60, height: 3, borderRadius: 99,
            background: `linear-gradient(90deg, ${cfg.primary}, ${cfg.secondary})`,
            margin: "10px auto 0",
          }} />
        </div>
      )}
    </div>
  );
}
