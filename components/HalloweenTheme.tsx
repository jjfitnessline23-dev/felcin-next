"use client";

// 🎃 Halloween seasonal theme controller.
// - Adds/removes the `theme-halloween` class on <html> (CSS in globals.css does the recolor).
// - Active when: user pref is "on", OR pref is "auto" (default) and today is in the
//   Oct 24 – Nov 1 window. Pref "off" disables it entirely.
// - Renders lightweight decorations (corner cobwebs + drifting bats) only while active.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/db";
import { db } from "@/lib/firebase";

const KEY = "felcin_halloween";
export type HalloweenPref = "on" | "off" | "auto";

export function getHalloweenPref(): HalloweenPref {
  if (typeof window === "undefined") return "auto";
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch { return "auto"; }
}

export function isAutoHalloweenWindow(d: Date = new Date()): boolean {
  const m = d.getMonth(), day = d.getDate(); // Oct = 9, Nov = 10
  return (m === 9 && day >= 24) || (m === 10 && day <= 1);
}

export function isHalloweenActive(): boolean {
  const pref = getHalloweenPref();
  if (pref === "on") return true;
  if (pref === "off") return false;
  return isAutoHalloweenWindow();
}

export function setHalloweenPref(pref: HalloweenPref): void {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("felcin-halloween-change")); } catch {}
}

function Bat({ size }: { size: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 64 40" fill="currentColor">
      <path d="M32 20 C22 6 12 6 2 14 C8 14 8 22 4 28 C12 22 20 24 26 30 C28 26 30 24 32 24 Z" />
      <path d="M32 20 C42 6 52 6 62 14 C56 14 56 22 60 28 C52 22 44 24 38 30 C36 26 34 24 32 24 Z" />
      <ellipse cx="32" cy="22" rx="4" ry="7" />
      <path d="M29 13 l2 4 -4 0 z" />
      <path d="M35 13 l-2 4 4 0 z" />
    </svg>
  );
}

function Cobweb({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none"
      stroke="rgba(216,210,235,0.5)" strokeWidth="1" strokeLinecap="round">
      <path d="M0 0 L100 0 M0 0 L70 30 M0 0 L50 50 M0 0 L30 70 M0 0 L0 100" />
      <path d="M22 0 Q15 15 0 22" />
      <path d="M48 0 Q31 31 0 48" />
      <path d="M74 0 Q47 47 0 74" />
      <path d="M100 0 Q60 60 0 100" />
    </svg>
  );
}

const BATS = [
  { dur: 26, delay: 0, size: 26 },
  { dur: 34, delay: 7, size: 17 },
  { dur: 30, delay: 14, size: 22 },
  { dur: 41, delay: 21, size: 14 },
];

export default function HalloweenTheme() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Admin global override (config/features.forceHalloween) — lets the owner turn
    // the theme on for everyone from the admin panel, independent of the date.
    let forced = false;
    const apply = () => {
      const pref = getHalloweenPref();
      const on = pref === "on" ? true : pref === "off" ? false : (forced || isAutoHalloweenWindow());
      setActive(on);
      document.documentElement.classList.toggle("theme-halloween", on);
    };
    apply();
    window.addEventListener("felcin-halloween-change", apply);
    window.addEventListener("focus", apply); // re-check the date window on return
    const unsub = onSnapshot(doc(db, "config", "features"), (snap) => {
      forced = !!snap.data()?.forceHalloween;
      apply();
    });
    return () => {
      window.removeEventListener("felcin-halloween-change", apply);
      window.removeEventListener("focus", apply);
      unsub();
    };
  }, []);

  if (!active) return null;

  return (
    <div className="hw-decor" aria-hidden="true">
      <Cobweb className="hw-cobweb tl" />
      <Cobweb className="hw-cobweb tr" />
      {BATS.map((b, i) => (
        <div key={i} className="hw-bat" style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
          <Bat size={b.size} />
        </div>
      ))}
    </div>
  );
}
