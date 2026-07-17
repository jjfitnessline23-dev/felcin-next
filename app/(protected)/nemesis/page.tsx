"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, limit } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface NemesisUser { uid: string; workoutCount: number; }

const NEMESIS_KEY = (id: string) => `nemesis_challenge_${id}`;

export default function NemesisPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myCount, setMyCount] = useState(0);
  const [nemesis, setNemesis] = useState<NemesisUser | null>(null);
  const [noNemesis, setNoNemesis] = useState(false);
  const [challenged, setChallenged] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        // Count own workout logs
        const mySnap = await getDocs(collection(db, "users", user!.uid, "workoutLogs"));
        const mine = mySnap.size;
        setMyCount(mine);

        // Fetch other users
        const usersSnap = await getDocs(query(collection(db, "users"), limit(50)));
        const candidates: NemesisUser[] = [];
        for (const d of usersSnap.docs) {
          if (d.id === user!.uid) continue;
          const data = d.data();
          const wc = typeof data.workoutCount === "number" ? data.workoutCount : 0;
          if (wc >= mine * 1.1 && wc <= mine * 1.4) {
            candidates.push({ uid: d.id, workoutCount: wc });
          }
        }

        if (candidates.length === 0) {
          setNoNemesis(true);
        } else {
          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          setNemesis(picked);
          setChallenged(!!localStorage.getItem(NEMESIS_KEY(picked.uid)));
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [user]);

  function handleChallenge() {
    if (!nemesis) return;
    localStorage.setItem(NEMESIS_KEY(nemesis.uid), "1");
    setChallenged(true);
  }

  const gap = nemesis ? nemesis.workoutCount - myCount : 0;
  const pct = nemesis ? Math.min(100, Math.round((myCount / nemesis.workoutCount) * 100)) : 0;

  return (
    <div className="max-w-xl mx-auto pb-24 overflow-x-hidden">
      <PageHeader title="Nemesis Mode" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#120500 0%,#1c0800 50%,#120500 100%)", border: "1px solid rgba(249,115,22,0.22)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(239,68,68,0.3) 0%,rgba(249,115,22,0.15) 35%,transparent 65%)", animation: "heroGlow 3s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(10deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#f97316", fontVariationSettings: "'FILL' 1" }}>sports_mma</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#f97316", letterSpacing: "0.18em" }}>NEMESIS MODE</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fdba74 55%,#ef4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Nemesis Mode</h1>
          <p className="text-sm" style={{ color: "#555" }}>Find your rival. Close the gap. Win.</p>
          {!loading && !noNemesis && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#f97316" }}>{myCount}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>your workouts</span></div>
              {nemesis && (<>
                <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
                <div><span className="text-base font-black" style={{ color: "#ef4444" }}>{nemesis.workoutCount}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>nemesis workouts</span></div>
                <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
                <div><span className="text-base font-black" style={{ color: "#f97316" }}>{gap}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>to close</span></div>
              </>)}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : noNemesis ? (
          <div className="flex flex-col items-center py-16 gap-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 52, color: "#333" }}>sports_mma</span>
            <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>No nemesis found yet</p>
            <p className="text-sm text-center px-8" style={{ color: "#555" }}>Log more workouts to get matched with a rival. You need peers who are 10-40% ahead of you.</p>
          </div>
        ) : nemesis ? (
          <>
            {/* Dramatic header */}
            <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: "linear-gradient(135deg, #1a0a0a 0%, #131313 100%)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: "#ef4444" }}>YOUR NEMESIS</span>
              <p className="text-2xl font-black mt-1" style={{ color: "#f2f2f2" }}>
                Nemesis #{nemesis.uid.slice(0, 4).toUpperCase()}
              </p>
              <p className="text-sm mt-1" style={{ color: "#666" }}>Anonymous rival — similar grind, ahead of the curve</p>
            </div>

            {/* Stats comparison */}
            <div className="rounded-2xl p-4 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] font-bold tracking-widest mb-4" style={{ color: "#444" }}>HEAD TO HEAD</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* You */}
                <div className="rounded-xl p-4 text-center" style={{ background: "#1a1a1a", border: "1px solid rgba(96,165,250,0.2)" }}>
                  <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: "#60a5fa" }}>YOU</p>
                  <p className="text-4xl font-black" style={{ color: "#f2f2f2" }}>{myCount}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#555" }}>workouts logged</p>
                </div>
                {/* Nemesis */}
                <div className="rounded-xl p-4 text-center" style={{ background: "#1a1a1a", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: "#ef4444" }}>NEMESIS</p>
                  <p className="text-4xl font-black" style={{ color: "#ef4444" }}>{nemesis.workoutCount}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#555" }}>workouts logged</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color: "#60a5fa" }}>Your progress</span>
                  <span className="text-xs" style={{ color: "#555" }}>{pct}% of nemesis</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 10, background: "#1f1f1f" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #60a5fa, #a78bfa)" }} />
                </div>
              </div>

              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#f97316" }}>trending_up</span>
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>
                  You&apos;re <span style={{ color: "#f97316" }}>{gap} workout{gap !== 1 ? "s" : ""}</span> behind your nemesis
                </p>
              </div>
            </div>

            {/* Challenge button */}
            <div className="rounded-2xl p-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              {challenged ? (
                <div className="flex flex-col items-center gap-2 py-3">
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#22c55e" }}>check_circle</span>
                  <p className="text-sm font-bold" style={{ color: "#22c55e" }}>Challenge Accepted</p>
                  <p className="text-xs text-center" style={{ color: "#555" }}>You&apos;ve accepted this challenge. Every workout closes the gap.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-center" style={{ color: "#888" }}>Ready to close the gap? Accept the challenge and make every session count.</p>
                  <button
                    onClick={handleChallenge}
                    className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    ⚔️ Challenge Accepted
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
