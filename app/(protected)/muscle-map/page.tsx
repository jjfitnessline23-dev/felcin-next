"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";

const Model = dynamic(() => import("react-body-highlighter").then(m => m.default), { ssr: false });

/* ── Types ── */
interface LogExercise { name: string; }
interface WorkoutLog  { date?: { seconds: number }; exercises: LogExercise[]; }
type MuscleKey = "chest"|"back"|"shoulders"|"biceps"|"triceps"|"core"|"quads"|"hamstrings"|"glutes"|"calves"|"traps";

/* ── Muscle definitions ── */
const MUSCLES: { key: MuscleKey; label: string; keywords: string[]; ant: string[]; post: string[] }[] = [
  { key:"chest",      label:"Chest",       keywords:["bench","chest","fly","pec","push-up","pushup","incline","decline","crossover"],
    ant:["chest"],                           post:[] },
  { key:"back",       label:"Back",        keywords:["row","pulldown","pull-up","pullup","chin","deadlift","lat","back","face pull"],
    ant:[],                                  post:["upper-back","lower-back"] },
  { key:"shoulders",  label:"Shoulders",   keywords:["shoulder","lateral raise","delt","overhead press","military","front raise","arnold"],
    ant:["front-deltoids"],                  post:["back-deltoids"] },
  { key:"biceps",     label:"Biceps",      keywords:["curl","bicep","hammer","preacher","concentration"],
    ant:["biceps"],                          post:[] },
  { key:"triceps",    label:"Triceps",     keywords:["tricep","extension","pushdown","skull","close grip"],
    ant:["triceps"],                         post:["triceps"] },
  { key:"core",       label:"Core / Abs",  keywords:["plank","crunch","ab","core","sit-up","situp","leg raise","russian twist"],
    ant:["abs","obliques"],                  post:[] },
  { key:"quads",      label:"Quads",       keywords:["squat","leg press","lunge","quad","leg extension","hack squat"],
    ant:["quadriceps"],                      post:[] },
  { key:"hamstrings", label:"Hamstrings",  keywords:["rdl","hamstring","leg curl","stiff leg","romanian","nordic"],
    ant:[],                                  post:["hamstring"] },
  { key:"glutes",     label:"Glutes",      keywords:["hip thrust","glute","bridge","kickback"],
    ant:[],                                  post:["gluteal"] },
  { key:"calves",     label:"Calves",      keywords:["calf","calf raise","donkey"],
    ant:["calves"],                          post:["calves"] },
  { key:"traps",      label:"Traps",       keywords:["shrug","trap","farmer","upright row"],
    ant:[],                                  post:["trapezius"] },
];

function matchMuscles(name: string): MuscleKey[] {
  const l = name.toLowerCase();
  return MUSCLES.filter((m) => m.keywords.some((kw) => l.includes(kw))).map((m) => m.key);
}

/* ── Color helpers ──
   react-body-highlighter highlightedColors[frequency - 1]
   freq 1 → orange (6-7d overdue)
   freq 2 → yellow (4-5d)
   freq 3 → lime   (2-3d)
   freq 4 → green  (today / yesterday)
*/
const MODEL_COLORS = ["#f97316", "#eab308", "#84cc16", "#22c55e"];

function daysToFreq(days: number | null): number | null {
  if (days === null) return null;
  if (days < 1.5) return 4;
  if (days < 3.5) return 3;
  if (days < 5.5) return 2;
  if (days < 7.5) return 1;
  return null; // 7.5+ = not recently trained → gray
}

function freqToColor(freq: number | null): string {
  if (freq === null) return "#2a2a2a";
  return MODEL_COLORS[freq - 1];
}

function getLabel(days: number | null): string {
  if (days === null) return "Not trained";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7.5) return `${Math.floor(days)}d ago`;
  return "8d+ ago";
}

export default function MuscleMapPage() {
  const { user } = useAuth();
  const [loading, setLoading]       = useState(true);
  const [hasLogs, setHasLogs]       = useState(false);
  const [daysSince, setDaysSince]   = useState<Record<MuscleKey, number | null>>(
    Object.fromEntries(MUSCLES.map((m) => [m.key, null])) as Record<MuscleKey, number | null>
  );

  /* ── Real-time listener ── */
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "workoutLogs"), orderBy("date", "desc"), limit(50)),
      (snap) => {
        if (snap.empty) { setLoading(false); return; }
        setHasLogs(true);
        const now = Date.now();
        const map = Object.fromEntries(MUSCLES.map((m) => [m.key, null])) as Record<MuscleKey, number | null>;
        for (const d of snap.docs) {
          const log = d.data() as WorkoutLog;
          if (!log.date) continue;
          const daysAgo = (now - log.date.seconds * 1000) / 86400000;
          for (const ex of (log.exercises || [])) {
            for (const muscle of matchMuscles(ex.name)) {
              if (map[muscle] === null || daysAgo < map[muscle]!) map[muscle] = daysAgo;
            }
          }
        }
        setDaysSince(map);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user]);

  /* ── Derived ── */
  const trained   = MUSCLES.filter((m) => daysSince[m.key] !== null && daysSince[m.key]! < 7.5).length;
  const overdue   = MUSCLES.filter((m) => daysSince[m.key] !== null && daysSince[m.key]! >= 7.5).length;
  const untrained = MUSCLES.filter((m) => daysSince[m.key] === null).length;
  const needsWork = MUSCLES.filter((m) => daysSince[m.key] === null || daysSince[m.key]! >= 5.5);

  const sorted = [...MUSCLES].sort((a, b) => {
    const da = daysSince[a.key], db_ = daysSince[b.key];
    if (da === null && db_ === null) return 0;
    if (da === null) return 1;
    if (db_ === null) return -1;
    return db_! - da!; // most overdue first
  });

  /* ── Build model data ── */
  const antData: object[]  = [];
  const postData: object[] = [];
  const seen = new Set<string>(); // track added muscle names to avoid duplication

  for (const m of MUSCLES) {
    const freq = daysToFreq(daysSince[m.key]);
    if (freq === null) continue;
    if (m.ant.length) {
      const key = `ant-${freq}-${m.ant.join(",")}`;
      if (!seen.has(key)) { antData.push({ name: m.key, muscles: m.ant, frequency: freq }); seen.add(key); }
    }
    if (m.post.length) {
      const key = `post-${freq}-${m.post.join(",")}`;
      if (!seen.has(key)) { postData.push({ name: m.key, muscles: m.post, frequency: freq }); seen.add(key); }
    }
  }

  return (
    <div className="max-w-xl mx-auto overflow-x-hidden" style={{ paddingBottom: 96 }}>
      <PageHeader title="Muscle Map" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#120800 0%,#1c0e00 50%,#120800 100%)", border: "1px solid rgba(249,115,22,0.2)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(249,115,22,0.25) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(30deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#f97316", fontVariationSettings: "'FILL' 1" }}>accessibility_new</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#f97316", letterSpacing: "0.18em" }}>MUSCLE MAP</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fdba74 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Muscle Map</h1>
          <p className="text-sm" style={{ color: "#555" }}>Real-time heatmap of your trained muscle groups</p>
          {!loading && hasLogs && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#22c55e" }}>{trained}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>trained</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#f97316" }}>{needsWork.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>need work</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#555" }}>{untrained}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>not logged</span></div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="spinner" /></div>
      ) : !hasLogs ? (
        <div className="flex flex-col items-center py-20 gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#f97316" }}>accessibility_new</span>
          </div>
          <p className="text-lg font-bold" style={{ color: "#f2f2f2" }}>No workouts logged yet</p>
          <p className="text-sm" style={{ color: "#555" }}>Log a workout and your muscle map fills in automatically — in real time.</p>
          <Link href="/workouts" className="flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold no-underline mt-2" style={{ background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff", boxShadow: "0 0 20px rgba(249,115,22,0.3)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fitness_center</span>
            Go to Workout Log
          </Link>
        </div>
      ) : (
        <>
          {/* ── Stats row ── */}
          <div className="flex gap-2 px-4 pt-3 pb-3">
            {[
              { label: "Trained",     value: trained,   color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
              { label: "Overdue",     value: overdue,   color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.2)"  },
              { label: "Not Trained", value: untrained, color: "#555",    bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" },
            ].map((s) => (
              <div key={s.label} className="flex-1 rounded-2xl py-3 text-center"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <p className="text-2xl font-bold leading-none mb-0.5" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] font-semibold" style={{ color: s.color + "aa" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Body diagram ── */}
          <div className="mx-4 rounded-3xl overflow-hidden mb-4"
            style={{ background: "linear-gradient(160deg,#0e0e1e 0%,#080810 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Label */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>MUSCLE HEATMAP</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}/>
                <span className="text-[10px]" style={{ color: "#22c55e" }}>Live</span>
              </div>
            </div>

            {/* Models */}
            <div className="flex justify-center gap-4 px-4 pb-4">
              {/* Front */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <span className="text-[9px] font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>FRONT</span>
                <Model
                  type="anterior"
                  data={antData as never[]}
                  bodyColor="#141428"
                  highlightedColors={MODEL_COLORS}
                  style={{ width: "100%" }}
                  svgStyle={{ display: "block" }}
                />
              </div>
              {/* Back */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <span className="text-[9px] font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>BACK</span>
                <Model
                  type="posterior"
                  data={postData as never[]}
                  bodyColor="#141428"
                  highlightedColors={MODEL_COLORS}
                  style={{ width: "100%" }}
                  svgStyle={{ display: "block" }}
                />
              </div>
            </div>

            {/* Color legend */}
            <div className="flex justify-center gap-4 pb-4">
              {[
                { color: "#22c55e", label: "Today" },
                { color: "#84cc16", label: "2-3d" },
                { color: "#eab308", label: "4-5d" },
                { color: "#f97316", label: "6-7d" },
                { color: "#2a2a2a", label: "Not trained", border: "#444" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className="rounded-full shrink-0" style={{ width: 7, height: 7, background: l.color, border: l.border ? `1px solid ${l.border}` : "none", boxShadow: l.border ? "none" : `0 0 5px ${l.color}` }} />
                  <span className="text-[9px]" style={{ color: "#555" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Muscle list ── */}
          <div className="px-4 mb-4">
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>MUSCLE GROUPS</p>
            <div className="flex flex-col gap-2">
              {sorted.map((m) => {
                const d      = daysSince[m.key];
                const freq   = daysToFreq(d);
                const color  = freqToColor(freq);
                const label  = getLabel(d);
                const pct    = d === null ? 0 : Math.max(4, Math.min(100, Math.round((1 - Math.min(d, 8) / 8) * 100)));
                return (
                  <div key={m.key} className="rounded-2xl px-4 py-3"
                    style={{ background: "#0f0f1a", border: `1px solid ${freq !== null ? color + "30" : "rgba(255,255,255,0.06)"}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full shrink-0" style={{ width: 8, height: 8, background: color, boxShadow: freq !== null ? `0 0 6px ${color}` : "none" }}/>
                        <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{m.label}</span>
                      </div>
                      <span className="text-xs font-medium" style={{ color }}>{label}</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: freq !== null ? `linear-gradient(90deg, ${color}, ${color}cc)` : "transparent", boxShadow: pct > 0 ? `0 0 6px ${color}` : "none" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Train this week ── */}
          {needsWork.length > 0 && (
            <div className="mx-4 rounded-2xl p-4 mb-4" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.18)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#f97316" }}>warning</span>
                <span className="text-sm font-bold" style={{ color: "#f97316" }}>Train these this week</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {needsWork.map((m) => (
                  <span key={m.key} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: "rgba(249,115,22,0.14)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick link ── */}
          <div className="px-4">
            <Link href="/workouts"
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold no-underline"
              style={{ background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff", boxShadow: "0 0 20px rgba(249,115,22,0.3)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
              Log a Workout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
