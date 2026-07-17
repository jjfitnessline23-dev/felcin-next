"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface LogSet { reps: number; weight: number; }
interface LogExercise { name: string; sets: LogSet[]; }
interface WorkoutLog { id: string; date?: { seconds: number }; exercises: LogExercise[]; }

function computeScore(logs: WorkoutLog[], nowMs: number) {
  const vol = (log: WorkoutLog) =>
    (log.exercises || []).reduce((s, ex) => s + ex.sets.reduce((s2, set) => s2 + set.reps * set.weight, 0), 0);

  const sorted = logs.filter((l) => l.date).sort((a, b) => b.date!.seconds - a.date!.seconds);
  const volume48h = sorted.filter((l) => nowMs - l.date!.seconds * 1000 <= 48 * 3600000).reduce((s, l) => s + vol(l), 0);
  const nonZero = sorted.filter((l) => vol(l) > 0);
  const avgVolume = nonZero.length > 0 ? nonZero.reduce((s, l) => s + vol(l), 0) / nonZero.length : 0;
  const daysSinceLast = sorted.length > 0 ? (nowMs - sorted[0].date!.seconds * 1000) / 86400000 : null;

  let score = 100;
  const factors: { label: string; delta: number; applied: boolean }[] = [];

  let volumePenalty = 0;
  if (avgVolume > 0 && volume48h > avgVolume * 1.2) {
    volumePenalty = -30; factors.push({ label: "Heavy session (>120% avg)", delta: -30, applied: true });
  } else if (avgVolume > 0 && volume48h > avgVolume * 0.5) {
    volumePenalty = -15; factors.push({ label: "Moderate session (>50% avg)", delta: -15, applied: true });
  } else if (volume48h > 0) {
    volumePenalty = -8; factors.push({ label: "Light recent session", delta: -8, applied: true });
  } else {
    factors.push({ label: "No workout in last 48h", delta: 0, applied: false });
  }
  score += volumePenalty;

  let restBonus = 0;
  if (daysSinceLast !== null && daysSinceLast >= 3) {
    restBonus = 18; factors.push({ label: "3+ days rest", delta: +18, applied: true });
  } else if (daysSinceLast !== null && daysSinceLast >= 2) {
    restBonus = 10; factors.push({ label: "2+ days rest", delta: +10, applied: true });
  } else {
    factors.push({ label: "Less than 2 days rest", delta: 0, applied: false });
  }
  score += restBonus;

  return { score: Math.max(10, Math.min(100, score)), volume48h, avgVolume, daysSinceLast, factors };
}

const LABELS = [
  { min: 85, label: "Peak Ready 🚀", color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",  glow: "rgba(34,197,94,0.4)" },
  { min: 70, label: "Ready 💪",      color: "#84cc16", bg: "rgba(132,204,22,0.12)", border: "rgba(132,204,22,0.3)", glow: "rgba(132,204,22,0.4)" },
  { min: 55, label: "Moderate 👍",   color: "#eab308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.3)",  glow: "rgba(234,179,8,0.4)" },
  { min: 40, label: "Recover 😴",    color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)", glow: "rgba(249,115,22,0.4)" },
  { min: 0,  label: "Rest Day ⚠️",  color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  glow: "rgba(239,68,68,0.4)" },
];

const TIPS: Record<string, string> = {
  "Peak Ready 🚀": "You're primed — go heavy and push for a PR today.",
  "Ready 💪":       "Good to train at standard intensity. Stay consistent.",
  "Moderate 👍":    "Train lighter today — focus on technique and form.",
  "Recover 😴":     "Mobility, stretching, or a light walk is ideal today.",
  "Rest Day ⚠️":   "Full rest. Sleep and nutrition are your recovery tools.",
};

const ZONE_COLORS = ["#ef4444","#f97316","#eab308","#84cc16","#22c55e"];

export default function RecoveryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ReturnType<typeof computeScore> | null>(null);
  const [dotDays, setDotDays] = useState<boolean[]>([]);

  useEffect(() => {
    if (!user) return;
    const nowMs = Date.now();
    getDocs(query(collection(db, "users", user.uid, "workoutLogs"), orderBy("date", "desc"), limit(30)))
      .then((snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) }));
        setResult(computeScore(logs, nowMs));
        const dots: boolean[] = [];
        for (let i = 6; i >= 0; i--) {
          const dayStart = nowMs - i * 86400000;
          dots.push(logs.some((l) => l.date && l.date.seconds * 1000 >= dayStart && l.date.seconds * 1000 < dayStart + 86400000));
        }
        setDotDays(dots);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  const info = result ? (LABELS.find((l) => result.score >= l.min) ?? LABELS[LABELS.length - 1]) : null;

  /* SVG ring */
  const R = 70, STROKE = 14;
  const circ = 2 * Math.PI * R;

  return (
    <div className="max-w-xl mx-auto overflow-x-hidden pb-10">
      <PageHeader title="Recovery Score" />

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#020e12 0%,#041820 50%,#020e12 100%)", border: `1px solid ${info ? info.border : "rgba(6,182,212,0.2)"}`, minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${info ? info.glow : "rgba(6,182,212,0.35)"},transparent)`, animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: `radial-gradient(ellipse at center,${info ? info.glow : "rgba(6,182,212,0.25)"} 0%,transparent 65%)`, animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(160deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: info ? info.bg : "rgba(6,182,212,0.2)", border: `1px solid ${info ? info.border : "rgba(6,182,212,0.4)"}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: info ? info.color : "#06b6d4", fontVariationSettings: "'FILL' 1" }}>monitor_heart</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: info ? info.color : "#06b6d4", letterSpacing: "0.18em" }}>RECOVERY SCORE</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, color: "#f2f2f2" }}>
            {loading ? "Calculating…" : info ? info.label : "Recovery Score"}
          </h1>
          <p className="text-sm" style={{ color: "#555" }}>
            {result?.daysSinceLast !== null && result?.daysSinceLast !== undefined
              ? `Last workout: ${result.daysSinceLast < 1 ? "Today" : result.daysSinceLast < 2 ? "Yesterday" : `${Math.floor(result.daysSinceLast)}d ago`}`
              : "Based on your workout history"}
          </p>
          {result && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-xl font-black" style={{ color: info?.color }}>{result.score}</span><span className="text-xs ml-1" style={{ color: "#555" }}>/100</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#555" }}>{dotDays.filter(Boolean).length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>days active this week</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {loading ? (
          <div className="ghost-bg flex justify-center py-24 rounded-3xl"><div className="spinner" /></div>
        ) : result && info ? (
          <>
            {/* ── Big Score Ring ── */}
            <div className="rounded-3xl p-6 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg,#0a0a14,#0f0f1a)`, border: `1px solid ${info.border}`, boxShadow: `0 0 40px ${info.glow.replace("0.4","0.12")}` }}>
              {/* Background glow */}
              <div className="absolute pointer-events-none" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 280, height: 280, background: `radial-gradient(circle,${info.glow.replace("0.4","0.15")} 0%,transparent 70%)` }} />

              <div className="relative flex flex-col items-center">
                {/* SVG Ring */}
                <div className="relative" style={{ width: 180, height: 180 }}>
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    {/* Glow filter */}
                    <defs>
                      <filter id="ringGlow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    {/* Track */}
                    <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={STROKE} />
                    {/* Zone gradient stops in track */}
                    <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={STROKE + 4} />
                    {/* Progress arc */}
                    <circle cx="90" cy="90" r={R} fill="none" stroke={info.color} strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeDasharray={`${(result.score / 100) * circ} ${circ}`}
                      transform="rotate(-90 90 90)"
                      filter="url(#ringGlow)"
                      style={{ transition: "stroke-dasharray 1s ease" }} />
                  </svg>
                  {/* Score centred */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-black tabular-nums leading-none" style={{ fontSize: 52, color: info.color }}>{result.score}</span>
                    <span className="text-xs font-semibold mt-1" style={{ color: "#555" }}>out of 100</span>
                  </div>
                </div>

                {/* Status pill */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-full mt-4 mb-2"
                  style={{ background: info.bg, border: `1px solid ${info.border}` }}>
                  <span className="text-sm font-black" style={{ color: info.color }}>{info.label}</span>
                </div>
                <p className="text-sm text-center leading-relaxed" style={{ color: "#666", maxWidth: 280 }}>{TIPS[info.label]}</p>
              </div>

              {/* Recovery zones bar */}
              <div className="mt-5">
                <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: "#333" }}>RECOVERY ZONES</p>
                <div className="relative h-2 rounded-full overflow-hidden flex">
                  {ZONE_COLORS.map((c, i) => (
                    <div key={i} className="flex-1" style={{ background: c, opacity: 0.6 }} />
                  ))}
                  {/* Marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
                    style={{ left: `calc(${result.score}% - 8px)`, background: info.color, transition: "left 1s ease", boxShadow: `0 0 8px ${info.glow}` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  {["Rest", "Recover", "Moderate", "Ready", "Peak"].map((z, i) => (
                    <span key={i} className="text-[9px]" style={{ color: "#444" }}>{z}</span>
                  ))}
                </div>
              </div>

              {/* 7-day activity strip */}
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[9px] font-bold tracking-widest mb-3" style={{ color: "#333" }}>7-DAY ACTIVITY</p>
                <div className="flex justify-between">
                  {["6d","5d","4d","3d","2d","1d","Today"].map((label, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <div className="rounded-full transition-all" style={{
                        width: 12, height: 12,
                        background: dotDays[i] ? info.color : "rgba(255,255,255,0.05)",
                        border: `1.5px solid ${dotDays[i] ? info.color : "rgba(255,255,255,0.1)"}`,
                        boxShadow: dotDays[i] ? `0 0 8px ${info.glow}` : "none",
                      }} />
                      <span className="text-[9px]" style={{ color: i === 6 ? info.color : "#333" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Today's Recommendation ── */}
            <div className="rounded-2xl p-5 relative overflow-hidden"
              style={{ background: info.bg, border: `1px solid ${info.border}` }}>
              <div className="absolute pointer-events-none inset-0 flex items-center justify-end pr-4">
                <img src="/static/logo-nav.svg" alt="" style={{ width: 80, opacity: 0.06, filter: "grayscale(1) brightness(3)" }} />
              </div>
              <div className="relative">
                <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: info.color + "99" }}>TODAY&apos;S RECOMMENDATION</p>
                <p className="text-base font-bold mb-1" style={{ color: "#f2f2f2" }}>{info.label}</p>
                <p className="text-sm leading-relaxed" style={{ color: "#888" }}>{TIPS[info.label]}</p>
              </div>
            </div>

            {/* ── Score Breakdown ── */}
            <div className="rounded-2xl p-5" style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[9px] font-bold tracking-widest mb-3" style={{ color: "#333" }}>SCORE BREAKDOWN</p>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#666" }}>Base score</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: "#f2f2f2", background: "rgba(255,255,255,0.06)" }}>100</span>
                </div>
                {result.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.delta > 0 ? "#22c55e" : f.delta < 0 ? "#ef4444" : "#333" }} />
                      <span className="text-xs" style={{ color: f.applied ? "#d0d0d0" : "#444" }}>{f.label}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full"
                      style={{ color: f.delta > 0 ? "#22c55e" : f.delta < 0 ? "#ef4444" : "#444", background: f.delta > 0 ? "rgba(34,197,94,0.1)" : f.delta < 0 ? "rgba(239,68,68,0.1)" : "transparent" }}>
                      {f.delta > 0 ? `+${f.delta}` : f.delta === 0 ? "—" : f.delta}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 mt-1" style={{ borderTop: `1px solid ${info.border}` }}>
                  <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Final Score</span>
                  <span className="text-xl font-black" style={{ color: info.color }}>{result.score}</span>
                </div>
              </div>
            </div>

            {/* ── Volume Stats ── */}
            <div className="rounded-2xl p-5" style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[9px] font-bold tracking-widest mb-3" style={{ color: "#333" }}>VOLUME STATS</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Last 48h volume", value: Math.round(result.volume48h).toLocaleString(), color: result.volume48h > result.avgVolume * 1.2 ? "#ef4444" : result.volume48h > 0 ? "#f97316" : "#555" },
                  { label: "Avg session volume", value: Math.round(result.avgVolume).toLocaleString(), color: "#06b6d4" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl p-4 relative overflow-hidden"
                    style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] mb-2" style={{ color: "#555" }}>{s.label}</p>
                    <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#333" }}>kg × reps</p>
                  </div>
                ))}
              </div>
            </div>

          </>
        ) : (
          <div className="ghost-bg flex flex-col items-center py-20 gap-4 text-center rounded-3xl">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#06b6d4" }}>monitor_heart</span>
            </div>
            <p className="font-bold text-base" style={{ color: "#f2f2f2" }}>No data yet</p>
            <p className="text-sm" style={{ color: "#555" }}>Log some workouts to see your recovery score</p>
          </div>
        )}
      </div>
    </div>
  );
}
