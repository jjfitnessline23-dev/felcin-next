"use client";

// 🎄 Christmas seasonal theme controller — mirrors HalloweenTheme.
// - Adds/removes `theme-christmas` on <html> (CSS in globals.css does the recolor).
// - Active when pref "on", OR "auto" (default) and today is Dec 1–26. "off" disables.
// - Renders falling snow only while active.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/db";
import { db } from "@/lib/firebase";

const KEY = "felcin_christmas";
export type ChristmasPref = "on" | "off" | "auto";

export function getChristmasPref(): ChristmasPref {
  if (typeof window === "undefined") return "auto";
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch { return "auto"; }
}

export function isAutoChristmasWindow(d: Date = new Date()): boolean {
  return d.getMonth() === 11 && d.getDate() <= 26; // December 1–26
}

export function isChristmasActive(): boolean {
  const pref = getChristmasPref();
  if (pref === "on") return true;
  if (pref === "off") return false;
  return isAutoChristmasWindow();
}

export function setChristmasPref(pref: ChristmasPref): void {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("felcin-christmas-change")); } catch {}
}

// Fixed flake layout (no randomness → no hydration mismatch). left %, size px, dur s, delay s.
const FLAKES = [
  { left: 4, size: 14, dur: 11, delay: 0 },
  { left: 12, size: 9, dur: 15, delay: 3 },
  { left: 20, size: 18, dur: 9, delay: 1 },
  { left: 29, size: 11, dur: 13, delay: 5 },
  { left: 37, size: 8, dur: 17, delay: 2 },
  { left: 45, size: 16, dur: 10, delay: 6 },
  { left: 53, size: 10, dur: 14, delay: 0 },
  { left: 61, size: 13, dur: 12, delay: 4 },
  { left: 68, size: 9, dur: 16, delay: 7 },
  { left: 75, size: 17, dur: 9, delay: 2 },
  { left: 83, size: 11, dur: 13, delay: 5 },
  { left: 90, size: 8, dur: 18, delay: 1 },
  { left: 96, size: 14, dur: 11, delay: 8 },
];

export default function ChristmasTheme() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Admin global override (config/features.forceChristmas).
    let forced = false;
    const apply = () => {
      const pref = getChristmasPref();
      const on = pref === "on" ? true : pref === "off" ? false : (forced || isAutoChristmasWindow());
      setActive(on);
      document.documentElement.classList.toggle("theme-christmas", on);
    };
    apply();
    window.addEventListener("felcin-christmas-change", apply);
    window.addEventListener("focus", apply); // re-check date window on return
    const unsub = onSnapshot(doc(db, "config", "features"), (snap) => {
      forced = !!snap.data()?.forceChristmas;
      apply();
    });
    return () => {
      window.removeEventListener("felcin-christmas-change", apply);
      window.removeEventListener("focus", apply);
      unsub();
    };
  }, []);

  if (!active) return null;

  return (
    <div className="xmas-decor" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="xmas-snow"
          style={{ left: `${f.left}vw`, fontSize: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}
