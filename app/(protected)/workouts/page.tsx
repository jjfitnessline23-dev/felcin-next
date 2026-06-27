"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, increment, updateDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import ExerciseDemo from "@/components/ExerciseDemo";


/* ?"??"??"? Types ?"??"??"? */
interface ActiveSet { reps: number; weight: number; done: boolean; }
interface CardioData { durationMins: number; distanceKm?: number; calories?: number; }
interface ActiveExercise { name: string; sets: ActiveSet[]; equipment?: string; type?: "strength" | "cardio"; cardio?: CardioData; }
interface ActiveSession { startTime: number; exercises: ActiveExercise[]; notes: string; }
interface LogSet { reps: number; weight: number; }
interface LogExercise { name: string; sets: LogSet[]; equipment?: string; type?: "strength" | "cardio"; cardio?: CardioData; }
interface WorkoutLog { id: string; date?: { seconds: number }; exercises: LogExercise[]; notes?: string; durationMins?: number; }
interface PlannedSet { reps: number; weight: number; }
interface PlannedExercise { name: string; sets: PlannedSet[]; equipment?: string; }
type DayPlans = Record<string, PlannedExercise[]>;

/* ?"??"??"? Equipment options ?"??"??"? */
const EQUIPMENT = [
  { label: "Barbell",    icon: "fitness_center" },
  { label: "Dumbbells",  icon: "sports_gymnastics" },
  { label: "Cable",      icon: "electrical_services" },
  { label: "Machine",    icon: "settings" },
  { label: "Bodyweight", icon: "accessibility_new" },
  { label: "Kettlebell", icon: "sports_martial_arts" },
  { label: "Resistance Band", icon: "sensors" },
  { label: "EZ Bar",     icon: "horizontal_rule" },
  { label: "Smith Machine", icon: "construction" },
];

/* ?"??"??"? Cardio presets ?"??"??"? */
const CARDIO_PRESETS = [
  { name: "Treadmill",       icon: "directions_run"  },
  { name: "Outdoor Run",     icon: "directions_run"  },
  { name: "Street Jog",      icon: "directions_run"  },
  { name: "Walking",         icon: "directions_walk" },
  { name: "Treadmill Walk",  icon: "directions_walk" },
  { name: "Cycling",         icon: "directions_bike" },
  { name: "Stationary Bike", icon: "directions_bike" },
  { name: "Elliptical",      icon: "sports_gymnastics" },
  { name: "Rowing",          icon: "rowing"          },
  { name: "Swimming",        icon: "pool"            },
  { name: "Jump Rope",       icon: "fitness_center"  },
  { name: "Stair Climber",   icon: "stairs"          },
];

/* ?"??"??"? Constants ?"??"??"? */
const SESSION_KEY  = "felcin_active_workout";
const UNIT_KEY     = "felcin_workout_unit";
const PLAN_KEY     = "felcin_workout_plan";
const DAYPLAN_KEY  = "felcin_day_plans";
const KG_TO_LBS   = 2.20462;
const REST_DEFAULT = 90;

/* ?"??"??"? Split templates ?"??"??"? */
type SplitKey = "ppl" | "upper_lower" | "full_body" | "bro" | "custom";
const SPLITS: Record<SplitKey, { name: string; days: string[] }> = {
  ppl:         { name: "Push Pull Legs",  days: ["Push","Pull","Legs","Push","Pull","Legs","Rest"] },
  upper_lower: { name: "Upper / Lower",   days: ["Upper","Lower","Rest","Upper","Lower","Rest","Rest"] },
  full_body:   { name: "Full Body",       days: ["Full Body","Rest","Full Body","Rest","Full Body","Rest","Rest"] },
  bro:         { name: "Bro Split",       days: ["Chest","Back","Shoulders","Legs","Arms","Rest","Rest"] },
  custom:      { name: "Custom",          days: ["","","","","","",""] },
};
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_COLOR: Record<string, string> = {
  Rest:"#2a2a2a", Push:"#6d28d9", Pull:"#1d4ed8", Legs:"#065f46",
  Upper:"#92400e", Lower:"#991b1b", "Full Body":"#0e7490",
  Chest:"#6d28d9", Back:"#1d4ed8", Shoulders:"#92400e", Arms:"#065f46",
};

/* ?"??"??"? Helpers ?"??"??"? */
function fmtDate(s: number) {
  return new Date(s * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}
function toDisplay(kg: number, useKg: boolean) { return useKg ? kg : Math.round(kg * KG_TO_LBS * 10) / 10; }
function toKg(val: number, useKg: boolean) { return useKg ? val : Math.round((val / KG_TO_LBS) * 100) / 100; }

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [useKg, setUseKg] = useState(true);
  const [showPlanEditor, setShowPlanEditor] = useState(false);

  /* History */
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<Record<string, number>>({});

  /* Mood */
  const [mood, setMood] = useState<string | null>(null);

  /* Active session */
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [restSecs, setRestSecs] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Plan */
  const [planKey, setPlanKey] = useState<SplitKey>("ppl");
  const [planDays, setPlanDays] = useState<string[]>(SPLITS.ppl.days.slice());
  const [histDay, setHistDay] = useState<string | null>(null);
  const [dayPlans, setDayPlans] = useState<DayPlans>({});
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [planSyncStatus, setPlanSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [planLoadStatus, setPlanLoadStatus] = useState<"loading" | "loaded" | "default" | "error">("loading");

  /* Exercise demo */
  const [demoExercise, setDemoExercise] = useState<string | null>(null);

  /* Timer refs */
  const elapsedRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const planSynced    = useRef(false);
  const planSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ?"??"? Load session + unit from localStorage ?"??"? */
  useEffect(() => {
    const unit = localStorage.getItem(UNIT_KEY);
    if (unit) setUseKg(unit === "kg");
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s: ActiveSession = JSON.parse(raw);
        setSession(s);
        setElapsed(Math.floor((Date.now() - s.startTime) / 1000));
      }
    } catch {}
  }, []);

  /* ?"??"? Load Firestore history ?"??"? */
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "users", user.uid, "workoutLogs"), orderBy("date", "desc")))
      .then((snap) => {
        const ls = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog,"id">) }));
        setLogs(ls);
        const prMap: Record<string, number> = {};
        for (const log of ls) {
          for (const ex of (log.exercises || [])) {
            const sets = ex.sets || [];
            if (!sets.length) continue;
            const best = Math.max(...sets.map((s) => s.weight));
            if (best > 0 && (!prMap[ex.name.toLowerCase()] || best > prMap[ex.name.toLowerCase()])) prMap[ex.name.toLowerCase()] = best;
          }
        }
        setPrs(prMap);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  /* ?"??"? Load plan from Firestore ??" stored on the root users/{uid} doc ?"??"? */
  function loadPlanFromFirestore(uid: string) {
    setPlanLoadStatus("loading");
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.workoutPlanKey) {
          setPlanKey(data.workoutPlanKey as SplitKey);
          if (data.workoutPlanDays) setPlanDays(data.workoutPlanDays);
          if (data.workoutDayPlans) setDayPlans(data.workoutDayPlans);
          setPlanLoadStatus("loaded");
          planSynced.current = true;
          return;
        }
      }
      // No plan in Firestore ??" check localStorage (web only; iOS localStorage is always empty)
      let migratedKey: SplitKey = "ppl";
      let migratedDays: string[] = SPLITS.ppl.days.slice();
      let migratedDayPlans: DayPlans = {};
      let hasLocalData = false;
      try {
        const raw = localStorage.getItem(PLAN_KEY);
        if (raw) { const { key, days } = JSON.parse(raw); migratedKey = key; migratedDays = days; hasLocalData = true; }
      } catch {}
      try {
        const raw = localStorage.getItem(DAYPLAN_KEY);
        if (raw) { migratedDayPlans = JSON.parse(raw); hasLocalData = true; }
      } catch {}
      setPlanKey(migratedKey);
      setPlanDays(migratedDays);
      setDayPlans(migratedDayPlans);
      if (hasLocalData) {
        // Only write to Firestore when migrating from web localStorage ??" never overwrite from an empty iOS device
        setPlanSyncStatus("saving");
        updateDoc(doc(db, "users", uid), { workoutPlanKey: migratedKey, workoutPlanDays: migratedDays, workoutDayPlans: migratedDayPlans })
          .then(() => { setPlanSyncStatus("saved"); setPlanLoadStatus("default"); })
          .catch(() => { setPlanSyncStatus("error"); setPlanLoadStatus("default"); });
      } else {
        setPlanLoadStatus("default");
      }
      planSynced.current = true;
    }).catch(() => { planSynced.current = true; setPlanLoadStatus("error"); });
  }

  useEffect(() => {
    if (!user) return;
    loadPlanFromFirestore(user.uid);
  }, [user]); // eslint-disable-line

  /* ?"??"? Save plan to Firestore (debounced) ?"??"? */
  useEffect(() => {
    if (!planSynced.current || !user) return;
    if (planSaveTimer.current) clearTimeout(planSaveTimer.current);
    planSaveTimer.current = setTimeout(() => {
      updateDoc(doc(db, "users", user.uid), { workoutPlanKey: planKey, workoutPlanDays: planDays, workoutDayPlans: dayPlans })
        .then(() => setPlanSyncStatus("saved"))
        .catch(() => setPlanSyncStatus("error"));
    }, 800);
  }, [planKey, planDays, dayPlans, user]); // eslint-disable-line

  /* ?"??"? Duration timer ?"??"? */
  useEffect(() => {
    if (!session) { if (elapsedRef.current) clearInterval(elapsedRef.current); return; }
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [!!session]); // eslint-disable-line

  /* ?"??"? Rest timer ?"??"? */
  useEffect(() => {
    if (restRef.current) clearInterval(restRef.current);
    if (!restActive) return;
    restRef.current = setInterval(() => setRestSecs((r) => r + 1), 1000);
    return () => { if (restRef.current) clearInterval(restRef.current); };
  }, [restActive]);

  /* ?"??"? Auto-init day plan when opened for the first time ?"??"? */
  useEffect(() => {
    if (planningDay && (!dayPlans[planningDay] || dayPlans[planningDay].length === 0)) {
      mutatePlan(planningDay, () => [{ name: "", sets: [{ reps: 10, weight: 0 }] }]);
    }
  }, [planningDay]); // eslint-disable-line

  /* ?"??"? Session helpers ?"??"? */
  function saveSession(s: ActiveSession | null) {
    setSession(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function mutate(fn: (s: ActiveSession) => ActiveSession) {
    setSession((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }

  function mutatePlan(day: string, fn: (exs: PlannedExercise[]) => PlannedExercise[]) {
    setDayPlans((prev) => ({ ...prev, [day]: fn(prev[day] || []) }));
  }

  function startWorkout(fromPlan?: PlannedExercise[]) {
    const exercises = fromPlan && fromPlan.length > 0
      ? fromPlan.map((e) => ({ name: e.name, equipment: e.equipment, sets: e.sets.map((s) => ({ ...s, done: false })) }))
      : [{ name: "", sets: [{ reps: 10, weight: 0, done: false }] }];
    saveSession({ startTime: Date.now(), exercises, notes: "" });
    setElapsed(0);
    if (mood && user) {
      addDoc(collection(db, "users", user.uid, "moodLogs"), { mood, date: serverTimestamp() }).catch(() => {});
    }
  }

  function addEx() { mutate((s) => ({ ...s, exercises: [...s.exercises, { name: "", sets: [{ reps: 10, weight: 0, done: false }] }] })); }
  function addCardio() { mutate((s) => ({ ...s, exercises: [...s.exercises, { name: "", type: "cardio" as const, sets: [], cardio: { durationMins: 0 } }] })); }
  function removeEx(ei: number) { mutate((s) => ({ ...s, exercises: s.exercises.filter((_, i) => i !== ei) })); }
  function addSet(ei: number) {
    mutate((s) => ({
      ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : {
        ...e, sets: [...e.sets, { reps: e.sets.at(-1)?.reps ?? 10, weight: e.sets.at(-1)?.weight ?? 0, done: false }],
      }),
    }));
  }
  function removeSet(ei: number, si: number) {
    mutate((s) => ({
      ...s, exercises: s.exercises.map((e, i) => i !== ei || e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) }),
    }));
  }
  function setExName(ei: number, name: string) { mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, name }) })); }
  function setEquipment(ei: number, equipment: string) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, equipment: e.equipment === equipment ? undefined : equipment }) }));
  }
  function setExType(ei: number, type: "strength" | "cardio") {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, type, cardio: type === "cardio" ? (e.cardio || { durationMins: 0 }) : e.cardio }) }));
  }
  function setCardioField(ei: number, field: keyof CardioData, value: number) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, cardio: { durationMins: 0, ...(e.cardio || {}), [field]: value } }) }));
  }
  function setField(ei: number, si: number, field: "reps" | "weight", raw: number) {
    const val = field === "weight" ? toKg(raw, useKg) : raw;
    mutate((s) => ({
      ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : {
        ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, [field]: val }),
      }),
    }));
  }
  function toggleDone(ei: number, si: number) {
    mutate((s) => {
      const wasDone = s.exercises[ei]?.sets[si]?.done;
      if (!wasDone) { setRestSecs(0); setRestActive(true); }
      return {
        ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : {
          ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, done: !set.done }),
        }),
      };
    });
  }

  async function endWorkout() {
    if (!user || !session || saving) return;
    const notes = (session.notes || "").trim();
    const named = session.exercises.filter((e) => (e.name || "").trim());
    setSaving(true);
    try {
      if (named.length > 0) {
        const durationMins = Math.max(1, Math.round(elapsed / 60));
        const exercises = named.map((e) => e.type === "cardio"
          ? { name: e.name, type: "cardio" as const, sets: [], cardio: e.cardio || { durationMins: 0 }, ...(e.equipment ? { equipment: e.equipment } : {}) }
          : { name: e.name, sets: e.sets.map(({ reps, weight }) => ({ reps, weight })), ...(e.equipment ? { equipment: e.equipment } : {}) }
        );
        const ref = await addDoc(collection(db, "users", user.uid, "workoutLogs"), {
          exercises, notes: notes || null, durationMins, date: serverTimestamp(),
        });
        updateDoc(doc(db, "users", user.uid), { workoutCount: increment(1) }).catch(() => {});
        updateDoc(doc(db, "users", user.uid, "public", "profile"), { workoutCount: increment(1) }).catch(() => {});
        const newPrs = { ...prs };
        for (const ex of exercises) {
          if (!ex.sets.length) continue;
          const best = Math.max(...ex.sets.map((s) => s.weight));
          const key = ex.name.toLowerCase();
          if (best > 0 && (!newPrs[key] || best > newPrs[key])) newPrs[key] = best;
        }
        setPrs(newPrs);
        setLogs((p) => [{ id: ref.id, exercises, notes: notes || undefined, durationMins }, ...p]);
      }
      saveSession(null); setElapsed(0); setRestSecs(0); setRestActive(false);
    } catch {}
    setSaving(false);
  }

  /* ?"??"? Plan helpers ?"??"? */
  function applyTemplate(key: SplitKey) {
    const days = key === "custom" ? planDays.slice() : SPLITS[key].days.slice();
    setPlanKey(key); setPlanDays(days);
  }
  function setPlanDay(di: number, val: string) {
    const days = planDays.map((d, i) => i === di ? val : d);
    setPlanDays(days); setPlanKey("custom");
  }

  /* ?"??"? Derived ?"??"? */
  const unitLabel  = useKg ? "kg" : "lbs";
  const todayIdx   = (new Date().getDay() + 6) % 7;
  const todayLabel = planDays[todayIdx] || "";
  const totalVol   = (log: WorkoutLog) => (log.exercises || []).reduce((s, ex) => s + (ex.sets || []).reduce((s2, set) => s2 + set.reps * set.weight, 0), 0);

  function logsForDay(label: string) {
    const indices = planDays.reduce((acc, d, i) => d === label ? [...acc, i] : acc, [] as number[]);
    return logs.filter((log) => {
      if (!log.date) return false;
      return indices.includes((new Date(log.date.seconds * 1000).getDay() + 6) % 7);
    });
  }

  return (
    <div className="max-w-xl mx-auto overflow-x-hidden" style={{ paddingBottom: session ? "calc(env(safe-area-inset-bottom, 0px) + 140px)" : "96px" }}>
      <PageHeader title="Workout Log" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#031208 0%,#061a0c 50%,#031208 100%)", border: "1px solid rgba(34,197,94,0.2)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(34,197,94,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(34,197,94,0.22) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(90deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#22c55e", letterSpacing: "0.18em" }}>WORKOUT LOG</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#86efac 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {session ? "Session Active" : todayLabel && todayLabel !== "Rest" ? `Today: ${todayLabel}` : todayLabel === "Rest" ? "Rest Day 💤" : "Workout Log"}
          </h1>
          <p className="text-sm" style={{ color: "#555" }}>{SPLITS[planKey].name}</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#22c55e" }}>{logs.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>workouts</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#fbbf24" }}>{Object.keys(prs).length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>PRs set</span></div>
              {session && (<>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
                <div><span className="text-base font-black tabular-nums" style={{ color: "#22c55e" }}>{fmtTimer(elapsed)}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>elapsed</span></div>
              </>)}
            </div>
          )}
        </div>
      </div>

      {/* My Plan card — tap to expand */}
      <div className="mx-4 mt-2 rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg,#0d1a0f,#131313)", border: "1px solid rgba(34,197,94,0.18)" }}>
        {/* Tappable header row */}
        <button onClick={() => setShowPlanEditor((v) => !v)} className="w-full flex items-center justify-between px-4 py-4 border-none cursor-pointer bg-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: todayLabel && todayLabel !== "Rest" ? (DAY_COLOR[todayLabel] || "#6d28d9") : "rgba(255,255,255,0.07)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#fff", fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>My Plan</p>
              <p className="text-xs" style={{ color: "#666" }}>
                {todayLabel && todayLabel !== "Rest" ? `Today: ${todayLabel} · ${SPLITS[planKey].name}` : todayLabel === "Rest" ? "Rest day today" : SPLITS[planKey].name}
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555" }}>
            {showPlanEditor ? "expand_less" : "expand_more"}
          </span>
        </button>

        {showPlanEditor && (
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {/* Today's exercises */}
            <div className="px-4 pt-4 pb-2">
              {todayLabel === "Rest" ? (
                <p className="text-sm pb-2" style={{ color: "#555" }}>Rest day — recovery is part of the process 💪</p>
              ) : todayLabel ? (
                <>
                  <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>TODAY&apos;S EXERCISES — {todayLabel.toUpperCase()}</p>
                  {(dayPlans[todayLabel] || []).filter((e) => (e.name || "").trim()).length > 0 ? (
                    <>
                      <div className="flex flex-col gap-2 mb-4">
                        {(dayPlans[todayLabel] || []).filter((e) => (e.name || "").trim()).map((ex, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{ex.name}</p>
                              {ex.equipment && <p className="text-[10px] mt-0.5" style={{ color: "#a78bfa" }}>{ex.equipment}</p>}
                            </div>
                            <p className="text-xs text-right" style={{ color: "#888" }}>
                              {ex.sets.length} sets · {ex.sets[0]?.reps} reps{ex.sets[0]?.weight > 0 ? ` @ ${toDisplay(ex.sets[0].weight, useKg)}${unitLabel}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                      {!session && (
                        <button onClick={() => { startWorkout(dayPlans[todayLabel]); setShowPlanEditor(false); }}
                          className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer flex items-center justify-center gap-2 mb-3"
                          style={{ background: DAY_COLOR[todayLabel] || "#6d28d9", color: "#fff" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                          Start {todayLabel} Workout
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm pb-3" style={{ color: "#555" }}>No exercises added for {todayLabel} yet — use Edit Plan below to add them.</p>
                  )}
                </>
              ) : (
                <div className="pb-3">
                  <p className="text-xs mb-2" style={{ color: "#555" }}>Choose your workout split:</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.entries(SPLITS) as [SplitKey, { name: string }][]).filter(([k]) => k !== "custom").map(([key, { name }]) => (
                      <button key={key} onClick={() => applyTemplate(key)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                        style={{ background: planKey === key ? "#f2f2f2" : "rgba(255,255,255,0.07)", color: planKey === key ? "#000" : "#888" }}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showPlanEditor && (
          <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {/* Sync status */}
            {planLoadStatus === "error" && user && (
              <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span className="text-xs" style={{ color: "#ef4444" }}>Couldn&apos;t load plan from cloud</span>
                <button onClick={() => loadPlanFromFirestore(user.uid)} className="text-xs font-bold px-2.5 py-1 rounded-full border-none cursor-pointer" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Retry</button>
              </div>
            )}
            {planSyncStatus === "saving" && <p className="text-xs mb-3" style={{ color: "#555" }}>Syncing…</p>}
            {planSyncStatus === "saved" && <p className="text-xs mb-3 flex items-center gap-1" style={{ color: "#22c55e" }}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>cloud_done</span> Synced to all devices</p>}

            {/* Template picker */}
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>WORKOUT SPLIT</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.entries(SPLITS) as [SplitKey, { name: string }][]).map(([key, { name }]) => (
                <button key={key} onClick={() => applyTemplate(key)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                  style={{ background: planKey === key ? "#f2f2f2" : "rgba(255,255,255,0.07)", color: planKey === key ? "#000" : "#666" }}>
                  {name}
                </button>
              ))}
            </div>

            {/* Weekly grid */}
            <div className="rounded-2xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              {DAYS.map((day, di) => {
                const label = planDays[di] || "";
                const isToday = di === todayIdx;
                const color = DAY_COLOR[label] || "#555";
                return (
                  <div key={di} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: di < 6 ? "1px solid rgba(255,255,255,0.05)" : "none", background: isToday ? "rgba(255,255,255,0.025)" : "transparent" }}>
                    <span className="text-xs font-bold shrink-0" style={{ width: 30, color: isToday ? "#fff" : "#555" }}>{day}</span>
                    {planKey === "custom" ? (
                      <input type="text" value={label} placeholder="Rest" onChange={(e) => setPlanDay(di, e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: "#f2f2f2", border: "none" }} />
                    ) : (
                      <span className="flex-1 text-sm" style={{ color: label && label !== "Rest" ? "#f2f2f2" : "#333" }}>{label || "Rest"}</span>
                    )}
                    {label && label !== "Rest" && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
                    {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: "#888" }}>TODAY</span>}
                  </div>
                );
              })}
            </div>

            {/* Pre-plan sessions */}
            <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: "#444" }}>PRE-PLAN SESSIONS</p>
            <p className="text-xs mb-3" style={{ color: "#555" }}>Set exercises, weights and reps for each day</p>
            {[...new Set(planDays.filter((d) => d && d !== "Rest"))].length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[...new Set(planDays.filter((d) => d && d !== "Rest"))].map((label) => {
                    const count = (dayPlans[label] || []).filter((e) => (e.name || "").trim()).length;
                    return (
                      <button key={label} onClick={() => setPlanningDay(planningDay === label ? null : label)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                        style={{ background: planningDay === label ? (DAY_COLOR[label] || "#555") : "rgba(255,255,255,0.07)", color: planningDay === label ? "#fff" : "#888" }}>
                        {label}
                        {count > 0 && <span className="text-[10px] font-bold" style={{ color: planningDay === label ? "rgba(255,255,255,0.7)" : "#34d399" }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
                {planningDay && (() => {
                  const day = planningDay!;
                  const exs = dayPlans[day] || [];
                  if (exs.length === 0) return null;
                  return (
                    <div className="rounded-2xl mb-3" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{day} Day Plan</span>
                        <span className="text-xs" style={{ color: "#555" }}>{exs.filter((e) => (e.name || "").trim()).length} exercises</span>
                      </div>
                      <div className="p-3 flex flex-col gap-3">
                        {exs.map((ex, ei) => (
                          <div key={ei} className="p-3 rounded-xl" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="flex items-center gap-2 mb-2">
                              <input type="text" placeholder={`Exercise ${ei + 1}`} value={ex.name}
                                onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, name: e.target.value }))}
                                className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                                style={{ background: "#2a2a2a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                              {exs.length > 1 && (
                                <button onClick={() => mutatePlan(day, (xs) => xs.filter((_, i) => i !== ei))} className="border-none bg-transparent cursor-pointer shrink-0">
                                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#444" }}>close</span>
                                </button>
                              )}
                            </div>
                            <div className="flex text-[10px] font-bold mb-1.5 px-1 gap-2" style={{ color: "#444" }}>
                              <span style={{ width: 20 }}>#</span><span className="flex-1 text-center">Reps</span><span className="flex-1 text-center">{unitLabel}</span><span style={{ width: 18 }} />
                            </div>
                            {(ex.sets || []).map((set, si) => (
                              <div key={si} className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs text-center tabular-nums" style={{ width: 20, color: "#555" }}>{si + 1}</span>
                                <input type="number" value={set.reps} min={0}
                                  onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, reps: Number(e.target.value) }) }))}
                                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                                <input type="number" value={toDisplay(set.weight, useKg)} min={0} step={useKg ? 0.5 : 1}
                                  onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, weight: toKg(Number(e.target.value), useKg) }) }))}
                                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                                <button onClick={() => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei || x.sets.length <= 1 ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) }))} className="border-none bg-transparent cursor-pointer shrink-0">
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#333" }}>remove</span>
                                </button>
                              </div>
                            ))}
                            <button onClick={() => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: [...x.sets, { reps: x.sets.at(-1)?.reps ?? 10, weight: x.sets.at(-1)?.weight ?? 0 }] }))}
                              className="mt-1 flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span> Add set
                            </button>
                          </div>
                        ))}
                        <button onClick={() => mutatePlan(day, (xs) => [...xs, { name: "", sets: [{ reps: 10, weight: 0 }] }])}
                          className="w-full py-2.5 rounded-xl text-sm border-none cursor-pointer flex items-center justify-center gap-1.5"
                          style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px dashed rgba(255,255,255,0.1)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span> Add Exercise
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* kg/lbs */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: "#555" }}>Weight unit:</span>
              <div className="flex items-center rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.07)" }}>
                {(["kg","lbs"] as const).map((u) => (
                  <button key={u} onClick={() => { setUseKg(u === "kg"); localStorage.setItem(UNIT_KEY, u); }}
                    className="px-3 py-1 rounded-full text-xs font-bold border-none cursor-pointer"
                    style={{ background: (useKg ? "kg" : "lbs") === u ? "#f2f2f2" : "transparent", color: (useKg ? "kg" : "lbs") === u ? "#000" : "#555" }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-2">

            {session ? (
              /* ?"??"? Active session ?"??"? */
              <div className="rounded-2xl mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>

                {/* Header row — timer + kg/lbs toggle */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#22c55e" }}>timer</span>
                    <span className="text-xl font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{fmtTimer(elapsed)}</span>
                  </div>
                  <div className="flex items-center rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.07)" }}>
                    {(["kg", "lbs"] as const).map((u) => (
                      <button key={u} onClick={() => { setUseKg(u === "kg"); localStorage.setItem(UNIT_KEY, u); }}
                        className="px-3 py-1 rounded-full text-xs font-bold border-none cursor-pointer"
                        style={{ background: (useKg ? "kg" : "lbs") === u ? "#f2f2f2" : "transparent", color: (useKg ? "kg" : "lbs") === u ? "#000" : "#555" }}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rest timer ??" always visible */}
                <div className="flex items-center justify-between px-4 py-2.5" style={{ background: restActive ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: restActive ? "#22c55e" : "#444" }}>self_improvement</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: restActive ? "#22c55e" : "#444" }}>
                      Rest {restSecs > 0 || restActive ? `— ${fmtTimer(restSecs)}` : "timer"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {restActive ? (
                      <button onClick={() => setRestActive(false)}
                        className="text-xs font-bold px-2.5 py-1 rounded-full border-none cursor-pointer"
                        style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>Stop</button>
                    ) : (
                      <button onClick={() => { setRestSecs(0); setRestActive(true); }}
                        className="text-xs font-bold px-2.5 py-1 rounded-full border-none cursor-pointer"
                        style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>Start</button>
                    )}
                    {(restSecs > 0 || restActive) && (
                      <button onClick={() => { setRestActive(false); setRestSecs(0); }}
                        className="text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>Reset</button>
                    )}
                  </div>
                </div>

                {/* Exercises */}
                <div className="p-3 flex flex-col gap-3">
                  {session.exercises.map((ex, ei) => {
                    const prKg    = prs[ex.name.toLowerCase()] ?? null;
                    const bestKg  = (ex.sets||[]).length ? Math.max(...(ex.sets||[]).map((s) => s.weight)) : 0;
                    const isNewPr = prKg !== null && bestKg > prKg && bestKg > 0;

                    return (
                      <div key={ei} className="p-3 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {/* Name row */}
                        <div className="flex items-center gap-2 mb-2">
                          <input type="text" placeholder={ex.type === "cardio" ? "Cardio activity" : `Exercise ${ei + 1}`} value={ex.name}
                            onChange={(e) => setExName(ei, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                            style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                          {(ex.name || "").trim().length > 2 && (
                            <button onClick={() => setDemoExercise(ex.name)}
                              className="border-none cursor-pointer shrink-0 flex items-center justify-center rounded-lg"
                              style={{ width:30, height:30, background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.25)" }}
                              title="How to do this exercise">
                              <svg width="14" height="14" viewBox="0 0 64 64" fill="none">
                                <path d="M 12 32 A 20 20 0 0 1 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white" fillOpacity="0.85"/>
                                <circle cx="24" cy="29" r="3.5" fill="#0d0d1a"/>
                                <circle cx="40" cy="29" r="3.5" fill="#0d0d1a"/>
                              </svg>
                            </button>
                          )}
                          {isNewPr && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: "rgba(251,191,36,0.18)", color: "#fbbf24" }}>🏆 PR!</span>
                          )}
                          {session.exercises.length > 1 && (
                            <button onClick={() => removeEx(ei)} className="border-none bg-transparent cursor-pointer shrink-0">
                              <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#444" }}>close</span>
                            </button>
                          )}
                        </div>

                        {/* Strength / Cardio toggle */}
                        <div className="flex gap-1.5 mb-2">
                          {(["strength", "cardio"] as const).map((t) => {
                            const active = (ex.type ?? "strength") === t;
                            return (
                              <button key={t} onClick={() => setExType(ei, t)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center justify-center gap-1.5"
                                style={{
                                  background: active ? (t === "cardio" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.03)",
                                  color: active ? (t === "cardio" ? "#22c55e" : "#f2f2f2") : "#444",
                                  border: `1px solid ${active ? (t === "cardio" ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.06)"}`,
                                }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                                  {t === "strength" ? "fitness_center" : "directions_run"}
                                </span>
                                {t === "strength" ? "Strength" : "Cardio"}
                              </button>
                            );
                          })}
                        </div>

                        {ex.type === "cardio" ? (
                          <>
                            {/* Cardio quick presets */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: "none" }}>
                              {CARDIO_PRESETS.map((p) => (
                                <button key={p.name} onClick={() => setExName(ei, p.name)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border-none cursor-pointer shrink-0"
                                  style={{ background: ex.name === p.name ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)", color: ex.name === p.name ? "#22c55e" : "#555", border: `1px solid ${ex.name === p.name ? "rgba(34,197,94,0.4)" : "transparent"}` }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{p.icon}</span>
                                  {p.name}
                                </button>
                              ))}
                            </div>

                            {/* Duration / Distance / Calories */}
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              {[
                                { label: "Duration (min)", field: "durationMins" as const, value: ex.cardio?.durationMins || "", step: 1 },
                                { label: `Distance (${useKg ? "km" : "mi"})`, field: "distanceKm" as const,
                                  value: ex.cardio?.distanceKm ? (useKg ? ex.cardio.distanceKm : Math.round(ex.cardio.distanceKm * 0.621371 * 10) / 10) : "",
                                  step: 0.1 },
                                { label: "Calories", field: "calories" as const, value: ex.cardio?.calories || "", step: 1 },
                              ].map(({ label, field, value, step }) => (
                                <div key={field} className="flex flex-col gap-1">
                                  <span className="text-[10px] text-center font-semibold" style={{ color: "#444" }}>{label}</span>
                                  <input type="number" value={value} min={0} step={step} placeholder="0"
                                    onChange={(e) => {
                                      const raw = Number(e.target.value);
                                      const val = field === "distanceKm" && !useKg ? Math.round((raw / 0.621371) * 100) / 100 : raw;
                                      setCardioField(ei, field, val);
                                    }}
                                    className="px-2 py-2 rounded-lg outline-none text-sm text-center min-w-0"
                                    style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                                </div>
                              ))}
                            </div>

                            {/* Auto pace */}
                            {(ex.cardio?.durationMins ?? 0) > 0 && (ex.cardio?.distanceKm ?? 0) > 0 && (() => {
                              const distDisplay = useKg ? ex.cardio!.distanceKm! : ex.cardio!.distanceKm! * 0.621371;
                              const paceMin = ex.cardio!.durationMins / distDisplay;
                              const m = Math.floor(paceMin), s = Math.round((paceMin - m) * 60);
                              return <p className="text-[11px]" style={{ color: "#555" }}>Pace: {m}:{String(s).padStart(2,"0")} /{useKg ? "km" : "mi"}</p>;
                            })()}
                          </>
                        ) : (
                          <>
                            {/* Equipment chips */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: "none" }}>
                              {EQUIPMENT.map((eq) => {
                                const active = ex.equipment === eq.label;
                                return (
                                  <button key={eq.label} onClick={() => setEquipment(ei, eq.label)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border-none cursor-pointer shrink-0 transition-all"
                                    style={{ background: active ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: active ? "#c4b5fd" : "#444", border: `1px solid ${active ? "rgba(167,139,250,0.4)" : "transparent"}` }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{eq.icon}</span>
                                    {eq.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* PR reference */}
                            {prKg !== null && ex.name.trim() && (
                              <p className="text-[11px] mb-1.5 px-1" style={{ color: "#555" }}>
                                Best: {toDisplay(prKg, useKg)} {unitLabel}
                              </p>
                            )}

                            {/* Column headers */}
                            <div className="flex text-[10px] font-bold mb-1.5 px-1 gap-2" style={{ color: "#444" }}>
                              <span style={{ width: 20 }}>#</span>
                              <span className="flex-1 text-center">Reps</span>
                              <span className="flex-1 text-center">{unitLabel}</span>
                              <span style={{ width: 26 }} />
                              <span style={{ width: 18 }} />
                            </div>

                            {/* Sets */}
                            {(ex.sets||[]).map((set, si) => (
                              <div key={si} className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs text-center tabular-nums" style={{ width: 20, color: "#555" }}>{si + 1}</span>
                                <input type="number" value={set.reps} min={0}
                                  onChange={(e) => setField(ei, si, "reps", Number(e.target.value))}
                                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                  style={{ background: set.done ? "rgba(34,197,94,0.08)" : "#222", border: `1px solid ${set.done ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`, color: set.done ? "#22c55e" : "#f2f2f2" }} />
                                <input type="number" value={toDisplay(set.weight, useKg)} min={0} step={useKg ? 0.5 : 1}
                                  onChange={(e) => setField(ei, si, "weight", Number(e.target.value))}
                                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                  style={{ background: set.done ? "rgba(34,197,94,0.08)" : "#222", border: `1px solid ${set.done ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`, color: set.done ? "#22c55e" : "#f2f2f2" }} />
                                <button onClick={() => toggleDone(ei, si)}
                                  style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${set.done ? "#22c55e" : "#333"}`, background: set.done ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                                  {set.done && <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#000", fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>}
                                </button>
                                <button onClick={() => removeSet(ei, si)} className="border-none bg-transparent cursor-pointer shrink-0">
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#333" }}>remove</span>
                                </button>
                              </div>
                            ))}

                            <button onClick={() => addSet(ei)} className="mt-1 flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span> Add set
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex gap-2">
                    <button onClick={addEx}
                      className="flex-1 py-2.5 rounded-xl text-sm border-none cursor-pointer flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(255,255,255,0.04)", color: "#888", border: "1px dashed rgba(255,255,255,0.12)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span> Add Exercise
                    </button>
                    <button onClick={addCardio}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px dashed rgba(34,197,94,0.3)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>directions_run</span> Add Cardio
                    </button>
                  </div>

                  <textarea placeholder="Notes???" value={session.notes} rows={2}
                    onChange={(e) => mutate((s) => ({ ...s, notes: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none"
                    style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                </div>
              </div>
            ) : (
              /* ?"??"? No active session ?"??"? */
              <>
                {/* Comeback Trail */}
                {!loading && logs.length > 0 && logs[0].date && (Date.now() - logs[0].date.seconds * 1000) > 7 * 86400000 && (() => {
                  const daysSince = Math.floor((Date.now() - logs[0].date!.seconds * 1000) / 86400000);
                  return (
                    <div className="rounded-2xl p-4 mb-3" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f97316" }}>local_fire_department</span>
                        <span className="text-sm font-bold" style={{ color: "#f97316" }}>Welcome Back 🔥</span>
                      </div>
                      <p className="text-xs mb-3" style={{ color: "#888" }}>It&apos;s been <span style={{ color: "#f2f2f2", fontWeight: 600 }}>{daysSince} days</span> since your last workout. Here&apos;s your comeback plan:</p>
                      <div className="flex flex-col gap-2 mb-3">
                        {[
                          { week: "Week 1", sessions: 3, advice: "60% of your usual weights, focus on form" },
                          { week: "Week 2", sessions: 4, advice: "75% intensity, add volume gradually" },
                          { week: "Week 3", sessions: 5, advice: "Back to full intensity 🔥" },
                        ].map((w) => (
                          <div key={w.week} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color: "#f97316", width: 48 }}>{w.week}</span>
                            <span className="text-xs" style={{ color: "#888" }}><span style={{ color: "#f2f2f2" }}>{w.sessions}×/week</span> — {w.advice}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => startWorkout()}
                        className="w-full py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                        style={{ background: "#f97316", color: "#fff" }}>
                        Start Week 1 Workout
                      </button>
                    </div>
                  );
                })()}

                <div className="flex flex-col items-center py-6 mb-4 rounded-2xl gap-3" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* Mood Check */}
                  <div className="w-full px-4">
                    <p className="text-xs text-center mb-2.5" style={{ color: "#555" }}>How are you feeling today?</p>
                    <div className="flex gap-1.5 justify-center flex-wrap">
                      {[
                        { emoji: "💪", label: "Energized" },
                        { emoji: "😊", label: "Good" },
                        { emoji: "😑", label: "Meh" },
                        { emoji: "😴", label: "Tired" },
                        { emoji: "😤", label: "Stressed" },
                      ].map((m) => (
                        <button key={m.label} onClick={() => setMood(mood === m.label ? null : m.label)}
                          className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl border-none cursor-pointer text-xs font-semibold transition-all"
                          style={{ background: mood === m.label ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: mood === m.label ? "#c4b5fd" : "#555", border: `1px solid ${mood === m.label ? "rgba(167,139,250,0.4)" : "transparent"}` }}>
                          <span className="text-base">{m.emoji}</span>
                          <span className="text-[10px]">{m.label}</span>
                        </button>
                      ))}
                    </div>
                    {mood && (
                      <p className="text-xs text-center mt-2" style={{ color: "#a78bfa" }}>
                        {({
                          Energized: "Perfect day to go heavy — let's get it!",
                          Good:       "Great session incoming 💪",
                          Meh:        "Start anyway — momentum builds fast",
                          Tired:      "Light cardio or mobility today",
                          Stressed:   "HIIT can melt stress away",
                        } as Record<string, string>)[mood]}
                      </p>
                    )}
                  </div>

                  <button onClick={() => startWorkout()}
                    className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
                    style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff", boxShadow: "0 0 20px rgba(34,197,94,0.35)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    Start Workout
                  </button>
                </div>
              </>
            )}

            {/* ?"??"? History ?"??"? */}
            {loading ? (
              <div className="flex justify-center py-10"><div className="spinner" /></div>
            ) : logs.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: "#555" }}>No workouts logged yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {logs.map((log) => {
                  const vol   = totalVol(log);
                  const hasPr = (log.exercises || []).some((ex) => { const sets = ex.sets || []; if (!sets.length) return false; const best = Math.max(...sets.map((s) => s.weight)); return best > 0 && prs[ex.name.toLowerCase()] === best; });
                  return (
                    <div key={log.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>
                          {log.date ? fmtDate(log.date.seconds) : "Today"}
                          {log.durationMins && <span className="font-normal ml-2" style={{ color: "#555" }}>{log.durationMins}m</span>}
                        </p>
                        {hasPr && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>ðŸ† PR</span>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {(log.exercises || []).map((ex, i) => {
                          const isCardio = ex.type === "cardio";
                          const best = isCardio ? 0 : Math.max(0, ...(ex.sets || []).map((s) => s.weight));
                          const isPr = !isCardio && best > 0 && prs[ex.name.toLowerCase()] === best;
                          return (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                                {isCardio && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>Cardio</span>}
                                {isPr && <span className="text-[10px] font-bold" style={{ color: "#fbbf24" }}>PR</span>}
                                {ex.equipment && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}>{ex.equipment}</span>}
                              </div>
                              <span className="text-xs" style={{ color: "#555" }}>
                                {isCardio && ex.cardio
                                  ? [
                                      ex.cardio.durationMins ? `${ex.cardio.durationMins}min` : null,
                                      ex.cardio.distanceKm ? `${useKg ? ex.cardio.distanceKm : Math.round(ex.cardio.distanceKm * 0.621371 * 10) / 10}${useKg ? "km" : "mi"}` : null,
                                      ex.cardio.calories ? `${ex.cardio.calories}kcal` : null,
                                    ].filter(Boolean).join(" · ")
                                  : `${(ex.sets||[]).length}× ${(ex.sets||[]).map((s) => `${s.reps}${s.weight > 0 ? `@${toDisplay(s.weight, useKg)}` : ""}`).join(", ")}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {vol > 0 && <p className="text-xs mt-2" style={{ color: "#444" }}>{Math.round(useKg ? vol : vol * KG_TO_LBS).toLocaleString()} {unitLabel} volume</p>}
                      {log.notes && <p className="text-xs mt-1 italic" style={{ color: "#444" }}>{log.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}

        {/* ?.??.??.??.? DAY HISTORY (inside plan editor) ?.??.??.??.? */}
        {showPlanEditor && (
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>DAY HISTORY</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {[...new Set(planDays.filter((d) => d && d !== "Rest"))].map((label) => (
                <button key={label} onClick={() => setHistDay(histDay === label ? null : label)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                  style={{ background: histDay === label ? (DAY_COLOR[label] || "#555") : "rgba(255,255,255,0.07)", color: histDay === label ? "#fff" : "#888" }}>
                  {label}
                </button>
              ))}
            </div>
            {histDay && (() => {
              const dayLogs = logsForDay(histDay);
              return dayLogs.length === 0 ? (
                <p className="text-sm py-2 text-center" style={{ color: "#555" }}>No {histDay} workouts yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {dayLogs.map((log) => (
                    <div key={log.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xs font-bold mb-2" style={{ color: "#666" }}>{log.date ? fmtDate(log.date.seconds) : "Today"}{log.durationMins ? ` · ${log.durationMins}m` : ""}</p>
                      {(log.exercises||[]).map((ex, i) => (
                        <div key={i} className="flex items-center justify-between mb-1">
                          <span className="text-sm" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                          <span className="text-xs" style={{ color: "#555" }}>{ex.type === "cardio" && ex.cardio ? `${ex.cardio.durationMins ?? 0}min` : `${(ex.sets||[]).length}× ${(ex.sets||[]).map((s) => `${s.reps}${s.weight > 0 ? `@${toDisplay(s.weight, useKg)}` : ""}`).join(", ")}`}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

      </div>

      {/* Exercise demo modal */}
      {demoExercise && (
        <ExerciseDemo exerciseName={demoExercise} onClose={() => setDemoExercise(null)} />
      )}

      {/* Sticky end workout bar */}
      {session && (
        <div className="fixed left-0 right-0 flex items-center justify-between px-4 py-3 z-40"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
            background: "rgba(9,9,9,0.92)",
            backdropFilter: "blur(16px)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#22c55e" }}>timer</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{fmtTimer(elapsed)}</span>
            <span className="text-xs" style={{ color: "#444" }}>
              · {session.exercises.filter((e) => (e.name || "").trim()).length} exercises
            </span>
          </div>
          <button onClick={endWorkout} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: saving ? "#333" : "#ef4444", color: "#fff" }}>
            {saving ? "Saving…" : "End Workout"}
          </button>
        </div>
      )}
    </div>
  );
}
