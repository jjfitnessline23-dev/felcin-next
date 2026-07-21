"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, increment, updateDoc, doc, getDoc } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import ExerciseDemo from "@/components/ExerciseDemo";

/* ── Types ── */
type SetType = "W" | "S" | "D";
interface ActiveSet { reps: number; weight: number; done: boolean; setType: SetType; }
interface CardioData { durationMins: number; distanceKm?: number; calories?: number; }
interface ActiveExercise { name: string; sets: ActiveSet[]; equipment?: string; type?: "strength" | "cardio"; cardio?: CardioData; }
interface ActiveSession { startTime: number; exercises: ActiveExercise[]; notes: string; }
interface LogSet { reps: number; weight: number; }
interface LogExercise { name: string; sets: LogSet[]; equipment?: string; type?: "strength" | "cardio"; cardio?: CardioData; }
interface WorkoutLog { id: string; date?: { seconds: number }; exercises: LogExercise[]; notes?: string; durationMins?: number; }
interface PlannedSet { reps: number; weight: number; }
interface PlannedExercise { name: string; sets: PlannedSet[]; equipment?: string; }
type DayPlans = Record<string, PlannedExercise[]>;

const EQUIPMENT = [
  { label: "Barbell", icon: "fitness_center" },
  { label: "Dumbbells", icon: "sports_gymnastics" },
  { label: "Cable", icon: "electrical_services" },
  { label: "Machine", icon: "settings" },
  { label: "Bodyweight", icon: "accessibility_new" },
  { label: "Kettlebell", icon: "sports_martial_arts" },
  { label: "Resistance Band", icon: "sensors" },
  { label: "EZ Bar", icon: "horizontal_rule" },
  { label: "Smith Machine", icon: "construction" },
];

const CARDIO_PRESETS = [
  { name: "Treadmill", icon: "directions_run" },
  { name: "Outdoor Run", icon: "directions_run" },
  { name: "Walking", icon: "directions_walk" },
  { name: "Cycling", icon: "directions_bike" },
  { name: "Stationary Bike", icon: "directions_bike" },
  { name: "Elliptical", icon: "sports_gymnastics" },
  { name: "Rowing", icon: "rowing" },
  { name: "Swimming", icon: "pool" },
  { name: "Jump Rope", icon: "fitness_center" },
];

const SESSION_KEY = "felcin_active_workout";
const UNIT_KEY    = "felcin_workout_unit";
const PLAN_KEY    = "felcin_workout_plan";
const DAYPLAN_KEY = "felcin_day_plans";
const KG_TO_LBS   = 2.20462;

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
const SET_TYPE_NEXT: Record<SetType, SetType> = { W: "S", S: "D", D: "W" };
const SET_TYPE_COLOR: Record<SetType, string> = { W: "#6b7280", S: "#7c3aed", D: "#dc2626" };

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
  const [useKg, setUseKg] = useState(false); // default lbs to match screenshots
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<Record<string, number>>({});
  // setRepPrMap[exerciseLower][weightKg] = maxReps
  const [setRepPrs, setSetRepPrs] = useState<Record<string, Record<number, number>>>({});

  const [mood, setMood] = useState<string | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const elapsedValRef  = useRef(0);
  const restSecsValRef = useRef(0);
  // DOM refs for direct timer display updates — no React re-render needed
  const elapsedDomRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const restDomRefs    = useRef<(HTMLSpanElement | null)[]>([]);
  const [restActive, setRestActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusedSet, setFocusedSet] = useState<{ ei: number; si: number } | null>(null);

  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; target: string; equipment: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [planKey, setPlanKey] = useState<SplitKey>("ppl");
  const [planDays, setPlanDays] = useState<string[]>(SPLITS.ppl.days.slice());
  const [dayPlans, setDayPlans] = useState<DayPlans>({});
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [planSyncStatus, setPlanSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [planLoadStatus, setPlanLoadStatus] = useState<"loading" | "loaded" | "default" | "error">("loading");

  const [demoExercise, setDemoExercise] = useState<string | null>(null);
  const [barbellModal, setBarbellModal] = useState<{ name: string; weightLbs: number; equipment: string } | null>(null);
  const [swapOpen, setSwapOpen] = useState<{ day: string; ei: number } | null>(null);
  const [infoOpen, setInfoOpen] = useState<{ day: string; ei: number; si: number } | null>(null);
  const [expandedPlanEx, setExpandedPlanEx] = useState<Record<string, boolean>>({});

  const scrollRestoreRef = useRef<number | null>(null);
  const elapsedRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const planSynced    = useRef(false);
  const planSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exNameTimer    = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const inputRefs     = useRef<Record<string, HTMLInputElement | null>>({});
  const toggleDebounceRef = useRef<Record<string, number>>({});

  /* Load localStorage */
  useEffect(() => {
    const unit = localStorage.getItem(UNIT_KEY);
    if (unit) setUseKg(unit === "kg");
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s: ActiveSession = JSON.parse(raw);
        s.exercises = s.exercises.map((e) => ({
          ...e, sets: e.sets.map((st) => ({ ...st, setType: (st.setType ?? "S") as SetType })),
        }));
        setSession(s);
        elapsedValRef.current = Math.floor((Date.now() - s.startTime) / 1000);
      }
    } catch {}
  }, []);

  /* Load history */
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "users", user.uid, "workoutLogs"), orderBy("date", "desc")))
      .then((snap) => {
        const ls = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) }));
        setLogs(ls);
        const prMap: Record<string, number> = {};
        const srMap: Record<string, Record<number, number>> = {};
        for (const log of ls) {
          for (const ex of (log.exercises || [])) {
            const key = ex.name.toLowerCase();
            if (!srMap[key]) srMap[key] = {};
            for (const s of (ex.sets || [])) {
              if (s.weight > 0 && (!prMap[key] || s.weight > prMap[key])) prMap[key] = s.weight;
              const wKey = Math.round(s.weight * 100);
              if (s.reps > 0 && (!srMap[key][wKey] || s.reps > srMap[key][wKey])) srMap[key][wKey] = s.reps;
            }
          }
        }
        setPrs(prMap);
        setSetRepPrs(srMap);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  /* Load plan */
  function loadPlanFromFirestore(uid: string) {
    setPlanLoadStatus("loading");
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.workoutPlanKey) {
          setPlanKey(data.workoutPlanKey as SplitKey);
          if (data.workoutPlanDays) setPlanDays(data.workoutPlanDays);
          if (data.workoutDayPlans) setDayPlans(data.workoutDayPlans);
          setPlanLoadStatus("loaded"); planSynced.current = true; return;
        }
      }
      let mk: SplitKey = "ppl", md = SPLITS.ppl.days.slice(), mp: DayPlans = {}, has = false;
      try { const r = localStorage.getItem(PLAN_KEY); if (r) { const { key, days } = JSON.parse(r); mk = key; md = days; has = true; } } catch {}
      try { const r = localStorage.getItem(DAYPLAN_KEY); if (r) { mp = JSON.parse(r); has = true; } } catch {}
      setPlanKey(mk); setPlanDays(md); setDayPlans(mp);
      if (has) {
        setPlanSyncStatus("saving");
        updateDoc(doc(db, "users", uid), { workoutPlanKey: mk, workoutPlanDays: md, workoutDayPlans: mp })
          .then(() => { setPlanSyncStatus("saved"); setPlanLoadStatus("default"); })
          .catch(() => { setPlanSyncStatus("error"); setPlanLoadStatus("default"); });
      } else setPlanLoadStatus("default");
      planSynced.current = true;
    }).catch(() => { planSynced.current = true; setPlanLoadStatus("error"); });
  }

  useEffect(() => { if (user) loadPlanFromFirestore(user.uid); }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!planSynced.current || !user) return;
    if (planSaveTimer.current) clearTimeout(planSaveTimer.current);
    planSaveTimer.current = setTimeout(() => {
      updateDoc(doc(db, "users", user.uid), { workoutPlanKey: planKey, workoutPlanDays: planDays, workoutDayPlans: dayPlans })
        .then(() => setPlanSyncStatus("saved")).catch(() => setPlanSyncStatus("error"));
    }, 800);
  }, [planKey, planDays, dayPlans, user]); // eslint-disable-line

  useEffect(() => {
    if (!session) { if (elapsedRef.current) clearInterval(elapsedRef.current); return; }
    elapsedRef.current = setInterval(() => {
      elapsedValRef.current += 1;
      const t = fmtTimer(elapsedValRef.current);
      elapsedDomRefs.current.forEach(el => { if (el) el.textContent = t; });
    }, 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [!!session]); // eslint-disable-line

  useEffect(() => {
    if (restRef.current) clearInterval(restRef.current);
    if (!restActive) return;
    restRef.current = setInterval(() => {
      restSecsValRef.current += 1;
      const t = fmtTimer(restSecsValRef.current);
      restDomRefs.current.forEach(el => { if (el) el.textContent = t; });
    }, 1000);
    return () => { if (restRef.current) clearInterval(restRef.current); };
  }, [restActive]);

  useEffect(() => {
    if (planningDay && (!dayPlans[planningDay] || dayPlans[planningDay].length === 0))
      mutatePlan(planningDay, () => [{ name: "", sets: [{ reps: 10, weight: 0 }] }]);
  }, [planningDay]); // eslint-disable-line

  // Runs after every commit — restores scroll if a mutation requested it
  useLayoutEffect(() => {
    if (scrollRestoreRef.current !== null) {
      window.scrollTo(0, scrollRestoreRef.current);
      scrollRestoreRef.current = null;
    }
  });

  /* Session */
  function saveSession(s: ActiveSession | null) {
    setSession(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }
  function mutate(fn: (s: ActiveSession) => ActiveSession) {
    scrollRestoreRef.current = window.scrollY;
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
    const exercises = fromPlan?.length
      ? fromPlan.map((e) => ({ name: e.name, equipment: e.equipment, sets: e.sets.map((s) => ({ ...s, done: false, setType: "S" as SetType })) }))
      : [{ name: "", sets: [{ reps: 10, weight: 0, done: false, setType: "S" as SetType }] }];
    saveSession({ startTime: Date.now(), exercises, notes: "" });
    elapsedValRef.current = 0;
    if (mood && user) addDoc(collection(db, "users", user.uid, "moodLogs"), { mood, date: serverTimestamp() }).catch(() => {});
  }
  function addEx() { mutate((s) => ({ ...s, exercises: [...s.exercises, { name: "", sets: [{ reps: 10, weight: 0, done: false, setType: "S" as SetType }] }] })); }
  function addCardio() { mutate((s) => ({ ...s, exercises: [...s.exercises, { name: "", type: "cardio" as const, sets: [], cardio: { durationMins: 0 } }] })); }
  function removeEx(ei: number) { mutate((s) => ({ ...s, exercises: s.exercises.filter((_, i) => i !== ei) })); }
  function addSet(ei: number) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : {
      ...e, sets: [...e.sets, { reps: e.sets.at(-1)?.reps ?? 10, weight: e.sets.at(-1)?.weight ?? 0, done: false, setType: "S" as SetType }],
    })}));
  }
  function removeSet(ei: number, si: number) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei || e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) }) }));
  }
  function cycleSetType(ei: number, si: number) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : {
      ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, setType: SET_TYPE_NEXT[set.setType ?? "S"] }),
    })}));
  }
  function setExName(ei: number, name: string) { mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, name }) })); }
  function openSearch(ei: number) { setSearchOpen(ei); setSearchQuery(""); setSearchResults([]); }
  function closeSearch() { setSearchOpen(null); setSearchQuery(""); setSearchResults([]); }
  function pickExercise(name: string) { if (searchOpen !== null) setExName(searchOpen, name); closeSearch(); }

  useEffect(() => {
    if (searchOpen === null || searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try { const r = await fetch(`/api/exercise-search?q=${encodeURIComponent(searchQuery)}`); if (r.ok) setSearchResults(await r.json()); }
      catch {} finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen]);

  function setEquipment(ei: number, eq: string) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, equipment: e.equipment === eq ? undefined : eq }) }));
  }
  function setExType(ei: number, type: "strength" | "cardio") {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, type, cardio: type === "cardio" ? (e.cardio || { durationMins: 0 }) : e.cardio }) }));
  }
  function setCardioField(ei: number, field: keyof CardioData, value: number) {
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, cardio: { durationMins: 0, ...(e.cardio || {}), [field]: value } }) }));
  }
  function setField(ei: number, si: number, field: "reps" | "weight", raw: number) {
    const val = field === "weight" ? toKg(raw, useKg) : raw;
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, [field]: val }) }) }));
  }
  function adjustWeight(ei: number, si: number, delta: number) {
    if (!session) return;
    const set = session.exercises[ei]?.sets[si];
    if (!set) return;
    const cur = toDisplay(set.weight, useKg);
    setField(ei, si, "weight", Math.max(0, Math.round((cur + delta) * 10) / 10));
  }
  function matchSet(ei: number, si: number) {
    if (!session || si === 0) return;
    const prev = session.exercises[ei]?.sets[si - 1];
    if (!prev) return;
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, reps: prev.reps, weight: prev.weight }) }) }));
  }
  function matchPrevSet(ei: number, si: number) {
    if (!session) return;
    const name = session.exercises[ei]?.name?.toLowerCase().trim();
    if (!name) return;
    const prevEx = logs.find((l) => l.exercises.some((e) => e.name.toLowerCase().trim() === name))?.exercises.find((e) => e.name.toLowerCase().trim() === name);
    const prevSet = prevEx?.sets[si];
    if (!prevSet) return;
    mutate((s) => ({ ...s, exercises: s.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, reps: prevSet.reps, weight: prevSet.weight }) }) }));
  }
  function toggleDone(ei: number, si: number) {
    // Debounce prevents double-tap from reading the same stale session state twice
    const key = `${ei}-${si}`;
    const now = Date.now();
    if (now - (toggleDebounceRef.current[key] ?? 0) < 300) return;
    toggleDebounceRef.current[key] = now;

    const wasDone = session?.exercises[ei]?.sets[si]?.done;
    mutate((s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => i !== ei ? e : {
        ...e, sets: e.sets.map((set, j) => j !== si ? set : { ...set, done: !set.done }),
      }),
    }));
    if (!wasDone) {
      restSecsValRef.current = 0;
      setRestActive(true);
    }
  }
  async function endWorkout() {
    if (!user || !session || saving) return;
    const named = session.exercises.filter((e) => (e.name || "").trim());
    setSaving(true);
    try {
      if (named.length > 0) {
        const durationMins = Math.max(1, Math.round(elapsedValRef.current / 60));
        const exercises = named.map((e) => e.type === "cardio"
          ? { name: e.name, type: "cardio" as const, sets: [], cardio: e.cardio || { durationMins: 0 }, ...(e.equipment ? { equipment: e.equipment } : {}) }
          : { name: e.name, sets: e.sets.map(({ reps, weight }) => ({ reps, weight })), ...(e.equipment ? { equipment: e.equipment } : {}) });
        const ref = await addDoc(collection(db, "users", user.uid, "workoutLogs"), { exercises, notes: (session.notes || "").trim() || null, durationMins, date: serverTimestamp() });
        updateDoc(doc(db, "users", user.uid), { workoutCount: increment(1) }).catch(() => {});
        updateDoc(doc(db, "users", user.uid, "public", "profile"), { workoutCount: increment(1) }).catch(() => {});
        const np = { ...prs };
        for (const ex of exercises) {
          if (!ex.sets.length) continue;
          const best = Math.max(...ex.sets.map((s) => s.weight));
          const key = ex.name.toLowerCase();
          if (best > 0 && (!np[key] || best > np[key])) np[key] = best;
        }
        setPrs(np);
        setLogs((p) => [{ id: ref.id, exercises, notes: (session.notes || "").trim() || undefined, durationMins }, ...p]);
      }
      saveSession(null); elapsedValRef.current = 0; restSecsValRef.current = 0; setRestActive(false);
    } catch {}
    setSaving(false);
  }

  function applyTemplate(key: SplitKey) { setPlanKey(key); setPlanDays(key === "custom" ? planDays.slice() : SPLITS[key].days.slice()); }
  function setPlanDay(di: number, val: string) { setPlanDays(planDays.map((d, i) => i === di ? val : d)); setPlanKey("custom"); }

  /* PR helpers */
  const totalVol = (log: WorkoutLog) =>
    (log.exercises || []).reduce((s, ex) => s + (ex.sets || []).reduce((s2, st) => s2 + st.reps * st.weight, 0), 0);
  const maxHistVol = logs.length > 0 ? Math.max(...logs.map(totalVol)) : 0;

  function getPrevSets(name: string): LogSet[] {
    const lower = name.toLowerCase().trim();
    for (const log of logs) {
      const ex = log.exercises.find((e) => e.name.toLowerCase().trim() === lower);
      if (ex?.sets?.length) return ex.sets;
    }
    return [];
  }

  function calcPlates(totalLbs: number): number[] {
    const available = [45, 35, 25, 10, 5, 2.5];
    let rem = Math.round((totalLbs - 45) / 2 * 10) / 10;
    if (rem <= 0) return [];
    const out: number[] = [];
    for (const p of available) {
      while (rem >= p - 0.01) { out.push(p); rem = Math.round((rem - p) * 10) / 10; }
    }
    return out;
  }

  function isSetRepPr(exName: string, weightKg: number, reps: number): boolean {
    const key = exName.toLowerCase();
    const wKey = Math.round(weightKg * 100);
    const best = setRepPrs[key]?.[wKey] ?? 0;
    return reps > 0 && reps >= best && best > 0;
  }

  function is1RmPr(exName: string, weightKg: number): boolean {
    const key = exName.toLowerCase();
    const best = prs[key];
    return !!best && weightKg >= best && weightKg > 0;
  }

  /* Derived */
  const unitLabel = useKg ? "kg" : "lbs";
  const todayIdx  = (new Date().getDay() + 6) % 7;
  const todayLabel = planDays[todayIdx] || "";
  const nonRestDays = [...new Set(planDays.filter((d) => d && d !== "Rest"))];

  return (
    <div className="max-w-xl mx-auto overflow-x-hidden" style={{ paddingBottom: session ? "calc(env(safe-area-inset-bottom,0px) + 140px)" : "96px" }}>
      <PageHeader title="Workout Log" />

      {/* Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#031208 0%,#061a0c 50%,#031208 100%)", border: "1px solid rgba(34,197,94,0.2)", minHeight: 140 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(34,197,94,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 120, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(90deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#22c55e", letterSpacing: "0.18em" }}>WORKOUT LOG</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.4rem,5vw,1.9rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#86efac 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {session ? "Session Active" : todayLabel && todayLabel !== "Rest" ? `Today: ${todayLabel}` : todayLabel === "Rest" ? "Rest Day 💤" : "Workout Log"}
          </h1>
          {!loading && (
            <div className="flex items-center gap-4 mt-2">
              <div><span className="text-base font-black" style={{ color: "#22c55e" }}>{logs.length}</span><span className="text-xs ml-1" style={{ color: "#555" }}>workouts</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#fbbf24" }}>{Object.keys(prs).length}</span><span className="text-xs ml-1" style={{ color: "#555" }}>PRs</span></div>
              {session && <><div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} /><div><span ref={el => { elapsedDomRefs.current[0] = el; }} className="text-base font-black tabular-nums" style={{ color: "#22c55e" }}>{fmtTimer(elapsedValRef.current)}</span><span className="text-xs ml-1" style={{ color: "#555" }}>elapsed</span></div></>}
            </div>
          )}
        </div>
      </div>

      {/* ── WEEKLY WORKOUT PLANNER ── */}
      <div className="mx-4 mb-3 rounded-2xl overflow-hidden" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Header */}
        <button onClick={() => setShowPlanEditor((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3.5 border-none cursor-pointer bg-transparent">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-black tracking-wide" style={{ color: "#f2f2f2" }}>WEEKLY WORKOUT PLANNER</p>
            <div className="flex items-center gap-1 mt-0.5">
              {planSyncStatus === "saved"
                ? <><span className="material-symbols-outlined" style={{ fontSize: 11, color: "#22c55e" }}>check_circle</span><span className="text-xs" style={{ color: "#22c55e" }}>Synced to all devices</span></>
                : <span className="text-xs" style={{ color: "#555" }}>{SPLITS[planKey].name}</span>}
            </div>
          </div>
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "#555" }}>{showPlanEditor ? "expand_less" : "expand_more"}</span>
        </button>

        {showPlanEditor && (
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-black tracking-widest mb-2" style={{ color: "#444" }}>WORKOUT SPLIT</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {(Object.entries(SPLITS) as [SplitKey, { name: string }][]).map(([key, { name }]) => (
                  <button key={key} onClick={() => applyTemplate(key)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                    style={{ background: planKey === key ? "#22c55e" : "rgba(255,255,255,0.07)", color: planKey === key ? "#000" : "#666" }}>
                    {name}
                  </button>
                ))}
              </div>

              {/* Today's action card */}
              {todayLabel && (
                <div className="rounded-2xl mb-3 overflow-hidden" style={{ background: "#1a1a1a", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{DAYS[todayIdx].charAt(0).toUpperCase() + DAYS[todayIdx].slice(1)}day: {todayLabel.toUpperCase()}</span>
                  </div>
                  {(dayPlans[todayLabel] || []).filter((e) => (e.name || "").trim()).length > 0 ? (
                    <div className="px-4 py-3">
                      <div className="flex flex-col gap-1.5 mb-3">
                        {(dayPlans[todayLabel] || []).filter((e) => (e.name || "").trim()).map((ex, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: "#f2f2f2" }}>{i + 1}. {ex.name}</span>
                            <span className="text-xs" style={{ color: "#555" }}>{ex.sets.length} sets</span>
                          </div>
                        ))}
                      </div>
                      {!session && (
                        <button onClick={() => { startWorkout(dayPlans[todayLabel]); setShowPlanEditor(false); }}
                          className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                          style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff" }}>
                          ▶ Start {todayLabel} Workout
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-sm mb-3" style={{ color: "#555" }}>No exercises planned yet.</p>
                      <button onClick={() => setPlanningDay(todayLabel)}
                        className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                        style={{ background: "#22c55e", color: "#000" }}>
                        [ + Add Exercises to {todayLabel} ]
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Day cards list */}
              <div className="flex flex-col gap-2 mb-3">
                {DAYS.map((dayName, di) => {
                  const label = planDays[di] || "";
                  if (!label || label === "Rest") return null;
                  const exs = (dayPlans[label] || []).filter((e) => (e.name || "").trim());
                  const totalSets = exs.reduce((s, e) => s + (e.sets || []).length, 0);
                  const isOpen = expandedDay === label;
                  const isToday = di === todayIdx;

                  return (
                    <div key={di} className="rounded-2xl" style={{ background: "#1a1a1a", border: `1px solid ${isToday ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)"}`, overflow: "visible" }}>
                      <button
                        onClick={() => setExpandedDay(isOpen ? null : label)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-none cursor-pointer bg-transparent text-left">
                        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: "#444" }}>drag_indicator</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{dayName.toUpperCase()} [{label}]</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPlanningDay(label); }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border-none cursor-pointer"
                              style={{ background: "rgba(255,255,255,0.08)", color: "#888" }}>
                              Edit Plan
                            </button>
                            {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>TODAY</span>}
                          </div>
                          {exs.length > 0 && <p className="text-xs mt-0.5" style={{ color: "#555" }}>{exs.length} exercise{exs.length !== 1 ? "s" : ""} · {totalSets} set{totalSets !== 1 ? "s" : ""}</p>}
                        </div>
                        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: "#444" }}>{isOpen ? "expand_less" : "chevron_right"}</span>
                      </button>

                      {exs.length > 0 && (
                        <div className="px-4 pb-3">
                          <p className="text-xs mb-1.5" style={{ color: "#444" }}>
                            {exs.map((e) => e.name).join(" · ")}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                              <div style={{ width: "0%", height: "100%", background: "#22c55e" }} />
                            </div>
                            <span className="text-[10px]" style={{ color: "#444" }}>0/{totalSets}</span>
                          </div>
                        </div>
                      )}

                      {/* Expanded exercise detail */}
                      {isOpen && exs.length > 0 && (
                        <div className="border-t px-4 py-3 flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                          {exs.map((ex, ei) => {
                            const prevSets = getPrevSets(ex.name);
                            const lastPrev = prevSets[0];
                            const planExKey = `${label}-${ei}`;
                            const isExExpanded = expandedPlanEx[planExKey] ?? (!!lastPrev);
                            const isSwapOpen = swapOpen?.day === label && swapOpen?.ei === ei;
                            const otherExs = exs.filter((_, i) => i !== ei).slice(0, 2);

                            if (!isExExpanded) {
                              return (
                                <div key={ei} className="rounded-xl p-3" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-sm font-bold" style={{ color: "#22c55e" }}>{ei + 1}. {ex.name}</p>
                                    <button onClick={() => setExpandedPlanEx(prev => ({ ...prev, [planExKey]: true }))} className="border-none bg-transparent cursor-pointer">
                                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555" }}>chevron_right</span>
                                    </button>
                                  </div>
                                  {ex.sets[0] && (
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <span className="text-xs shrink-0" style={{ color: "#555", minWidth: 44 }}>Set 1:</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs px-2 py-1 rounded-lg text-center" style={{ background: "#2a2a2a", color: "#444", minWidth: 56 }}>---</span>
                                        <span className="text-xs" style={{ color: "#444" }}>x</span>
                                        <span className="text-xs px-2 py-1 rounded-lg text-center" style={{ background: "#2a2a2a", color: "#444", minWidth: 56 }}>---</span>
                                      </div>
                                    </div>
                                  )}
                                  <button className="w-full py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                                    Auto-Fill Set 1 from Last Log
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div key={ei} className="rounded-xl p-3" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>

                                {/* Swap suggestion callout */}
                                {isSwapOpen && (
                                  <div style={{ position: "absolute", top: 2, right: 38, zIndex: 30, background: "#2c2c2c", borderRadius: 14, padding: "12px 14px", minWidth: 185, maxWidth: 225, boxShadow: "0 8px 28px rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                    {otherExs.length > 0 ? otherExs.map((other, oi) => {
                                      const otherPr = prs[other.name.toLowerCase()];
                                      const otherPrevData = getPrevSets(other.name)[0];
                                      return (
                                        <div key={oi}>
                                          {oi > 0 && <p className="text-[11px] text-center my-1.5" style={{ color: "#666" }}>or</p>}
                                          <p className="text-[12px] leading-snug" style={{ color: "#aaa" }}>
                                            Swap to: <strong style={{ color: "#f2f2f2" }}>{other.name}</strong>
                                          </p>
                                          <p className="text-[11px] mt-0.5" style={{ color: "#777" }}>
                                            {otherPr
                                              ? `(Max PR: ${toDisplay(otherPr, useKg)} ${unitLabel} each)`
                                              : otherPrevData
                                              ? `(Prev: ${toDisplay(otherPrevData.weight, useKg)} ${unitLabel} each)`
                                              : "(No data yet)"}
                                          </p>
                                        </div>
                                      );
                                    }) : <p className="text-xs" style={{ color: "#666" }}>No alternatives in plan</p>}
                                  </div>
                                )}

                                {/* Header */}
                                <div className="flex items-start justify-between gap-2 mb-0.5">
                                  <div>
                                    <p className="text-sm font-bold" style={{ color: "#22c55e" }}>{ei + 1}. {ex.name}</p>
                                    <p className="text-[10px] mt-0.5" style={{ color: "#555" }}>Source: {SPLITS[planKey].name} ({label})</p>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSwapOpen(isSwapOpen ? null : { day: label, ei }); setInfoOpen(null); }}
                                    className="border-none cursor-pointer flex items-center justify-center rounded-lg shrink-0"
                                    style={{ width: 28, height: 28, background: isSwapOpen ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)", marginTop: -2 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSwapOpen ? "#22c55e" : "#666" }}>sync</span>
                                  </button>
                                </div>

                                {/* Sets label */}
                                <p className="text-xs mb-1.5 mt-1" style={{ color: "#555" }}>Sets: {ex.sets.length} reps with inline controls</p>

                                {/* Set rows */}
                                <div className="flex flex-col gap-1.5">
                                  {ex.sets.map((set, si) => {
                                    const hasReps = set.reps > 0;
                                    const hasWeight = set.weight > 0;
                                    const filledBoth = hasReps && hasWeight;
                                    const matchLast = si > 0 && hasReps && !hasWeight;
                                    const repsOnlyFirst = si === 0 && hasReps && !hasWeight;
                                    const isEmpty = !hasReps && !hasWeight;
                                    const isInfoBtnOpen = infoOpen?.day === label && infoOpen?.ei === ei && infoOpen?.si === si;
                                    const prevSet = prevSets[si];
                                    const showInfoBtn = (filledBoth || repsOnlyFirst) && prevSets.length > 0;
                                    return (
                                      <div key={si} className="flex items-center gap-1.5" style={{ position: "relative" }}>
                                        <span className="text-xs shrink-0" style={{ color: "#555", minWidth: 44 }}>Set {si + 1}:</span>
                                        {filledBoth ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#2a2a2a", color: "#f2f2f2" }}>{set.reps} reps</span>
                                            <span className="text-xs" style={{ color: "#555" }}>@</span>
                                            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#2a2a2a", color: "#f2f2f2" }}>{toDisplay(set.weight, useKg)} {unitLabel}</span>
                                            {showInfoBtn && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setInfoOpen(isInfoBtnOpen ? null : { day: label, ei, si }); setSwapOpen(null); }}
                                                className="border-none cursor-pointer flex items-center justify-center rounded-full font-bold"
                                                style={{ width: 18, height: 18, background: isInfoBtnOpen ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)", color: isInfoBtnOpen ? "#22c55e" : "#888", fontSize: 10, flexShrink: 0 }}>
                                                ℹ
                                              </button>
                                            )}
                                          </div>
                                        ) : repsOnlyFirst ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#2a2a2a", color: "#f2f2f2" }}>{set.reps} reps</span>
                                            <span className="text-xs" style={{ color: "#555" }}>@</span>
                                            <span className="text-xs px-2 py-1 rounded-lg text-center" style={{ background: "#2a2a2a", color: "#444", minWidth: 56 }}>---</span>
                                            {showInfoBtn && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setInfoOpen(isInfoBtnOpen ? null : { day: label, ei, si }); setSwapOpen(null); }}
                                                className="border-none cursor-pointer flex items-center justify-center rounded-full font-bold"
                                                style={{ width: 18, height: 18, background: isInfoBtnOpen ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)", color: isInfoBtnOpen ? "#22c55e" : "#888", fontSize: 10, flexShrink: 0 }}>
                                                ℹ
                                              </button>
                                            )}
                                          </div>
                                        ) : matchLast ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#2a2a2a", color: "#f2f2f2" }}>{set.reps} reps</span>
                                            <span className="text-xs" style={{ color: "#555" }}>@</span>
                                            <span className="text-[11px] px-2 py-1 rounded-full font-semibold flex items-center gap-0.5" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>⚙ Match last</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs px-2 py-1 rounded-lg text-center" style={{ background: "#2a2a2a", color: "#444", minWidth: 56 }}>---</span>
                                            <span className="text-xs" style={{ color: "#444" }}>x</span>
                                            <span className="text-xs px-2 py-1 rounded-lg text-center" style={{ background: "#2a2a2a", color: "#444", minWidth: 56 }}>---</span>
                                          </div>
                                        )}
                                        {/* ℹ info popup */}
                                        {isInfoBtnOpen && (() => {
                                          const exKey = ex.name.toLowerCase();
                                          const exLogs = logs.filter(l => (l.exercises || []).some(e => e.name.toLowerCase() === exKey)).slice(0, 8);
                                          const rawVols = exLogs.map(l => { const e = (l.exercises || []).find(e2 => e2.name.toLowerCase() === exKey); return e ? (e.sets || []).reduce((s, st) => s + st.reps * st.weight, 0) : 0; });
                                          const vols = rawVols.length > 0 ? [...rawVols].reverse() : [];
                                          while (vols.length < 7) vols.unshift(0);
                                          const maxVol = Math.max(...vols, 1);
                                          const lastEntry = exLogs[0];
                                          const lastDate = lastEntry?.date ? new Date(lastEntry.date.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "last time";
                                          const baseW = prevSet?.weight ?? set.weight;
                                          const suggestion = useKg ? "0.5" : (Math.round(Math.max(0.1, toDisplay(baseW, false) * 0.002) * 10) / 10).toFixed(1);
                                          return (
                                            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: 0, zIndex: 40, background: "#1c1c1c", borderRadius: 14, padding: "12px 14px", width: 190, boxShadow: "0 8px 28px rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                              <p className="text-[11px] font-bold" style={{ color: "#f2f2f2" }}>Previous Log ({lastDate}):</p>
                                              <p className="text-[11px] mt-0.5 mb-2" style={{ color: "#888" }}>{prevSet ? `${prevSet.reps} x ${toDisplay(prevSet.weight, useKg)} ${unitLabel}.` : "—"}</p>
                                              <p className="text-[11px] font-bold" style={{ color: "#f2f2f2" }}>Progressive Overload:</p>
                                              <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: "#888" }}>+{suggestion} {unitLabel} suggested.</p>
                                              <div className="flex items-end gap-0.5" style={{ height: 34 }}>
                                                {vols.map((v, idx) => (
                                                  <div key={idx} style={{ flex: 1, background: idx === vols.length - 1 ? "#22c55e" : "#2a2a2a", height: `${Math.max(6, (v / maxVol) * 100)}%`, borderRadius: "2px 2px 0 0" }} />
                                                ))}
                                              </div>
                                              <p className="text-[9px] mt-1" style={{ color: "#555" }}>Recent volume for this lift</p>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Auto-fill button (no prev log) */}
                                {!lastPrev && (
                                  <button className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                                    Auto-Fill Set 1 from Last Log
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {/* Save & Commit */}
                          <button onClick={() => setExpandedDay(null)}
                            className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                            style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff" }}>
                            Save &amp; Commit Changes to Template
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Plan editor modal */}
              {planningDay && (() => {
                const day = planningDay!;
                const exs = dayPlans[day] || [];
                return (
                  <div className="rounded-2xl mb-3" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Edit {day} Plan</span>
                      <button onClick={() => setPlanningDay(null)} className="border-none bg-transparent cursor-pointer"><span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555" }}>close</span></button>
                    </div>
                    <div className="p-3 flex flex-col gap-3">
                      {exs.map((ex, ei) => (
                        <div key={ei} className="p-3 rounded-xl" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold shrink-0" style={{ color: "#22c55e", width: 20 }}>{ei + 1}.</span>
                            <input type="text" placeholder={`Exercise ${ei + 1}`} value={ex.name}
                              onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, name: e.target.value }))}
                              className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                              style={{ background: "#2a2a2a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                            {exs.length > 1 && (
                              <button onClick={() => mutatePlan(day, (xs) => xs.filter((_, i) => i !== ei))} className="border-none bg-transparent cursor-pointer">
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#444" }}>close</span>
                              </button>
                            )}
                          </div>
                          {(ex.sets || []).map((set, si) => (
                            <div key={si} className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs text-center" style={{ width: 20, color: "#555" }}>{si + 1}</span>
                              <input type="number" value={set.reps} min={0}
                                onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, reps: Number(e.target.value) }) }))}
                                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                              <input type="number" value={toDisplay(set.weight, useKg)} min={0} step={useKg ? 0.5 : 1}
                                onChange={(e) => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, weight: toKg(Number(e.target.value), useKg) }) }))}
                                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                              <button onClick={() => mutatePlan(day, (xs) => xs.map((x, i) => i !== ei || x.sets.length <= 1 ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) }))} className="border-none bg-transparent cursor-pointer">
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
                      <button onClick={() => setPlanningDay(null)}
                        className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                        style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff" }}>
                        Save &amp; Commit Changes to Template
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-2 pb-1">
                <span className="text-xs" style={{ color: "#555" }}>Unit:</span>
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
          </div>
        )}
      </div>

      <div className="px-4 pt-1">
        {session ? (
          /* ── Active session ── */
          <div className="rounded-2xl mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#22c55e" }}>timer</span>
                <span ref={el => { elapsedDomRefs.current[1] = el; }} className="text-xl font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{fmtTimer(elapsedValRef.current)}</span>
              </div>
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

            <div className="p-3 flex flex-col gap-3">
              {session.exercises.map((ex, ei) => {
                const prKg   = prs[ex.name.toLowerCase()] ?? null;
                const bestKg = (ex.sets||[]).length ? Math.max(...(ex.sets||[]).map((s) => s.weight)) : 0;
                const isNewPr = prKg !== null && bestKg >= prKg && bestKg > 0;
                const prevSets = getPrevSets(ex.name);
                const isFocusedEx = focusedSet?.ei === ei;
                const focusedSi = isFocusedEx ? focusedSet!.si : null;

                return (
                  <div key={ei} className="rounded-xl overflow-hidden" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Name row */}
                    <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                      {/* Exercise name — visible input so users know it's editable */}
                      <input type="text"
                        placeholder={ex.type === "cardio" ? "Cardio activity…" : "Exercise name…"}
                        value={ex.name}
                        onChange={(e) => setExName(ei, e.target.value)}
                        className="flex-1 outline-none text-base font-bold rounded-xl px-3 py-2"
                        style={{
                          background: ex.name ? "transparent" : "rgba(255,255,255,0.05)",
                          border: ex.name ? "none" : "1px dashed rgba(255,255,255,0.15)",
                          color: "#f2f2f2",
                          minWidth: 0,
                          caretColor: "#22c55e",
                        }} />
                      {/* Weight visualizer — shows as soon as name is typed, adapts to equipment */}
                      {ex.type !== "cardio" && ex.name.trim().length > 0 && (
                        <button
                          onClick={() => {
                            const weights = (ex.sets||[]).map((s) => s.weight).filter((w) => w > 0);
                            const maxW = weights.length > 0 ? Math.max(...weights) : 0;
                            setBarbellModal({ name: ex.name, weightLbs: toDisplay(maxW, false), equipment: ex.equipment || "Barbell" });
                          }}
                          className="border-none cursor-pointer shrink-0 flex items-center justify-center rounded-lg"
                          style={{ width: 30, height: 30, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                          title="View weight diagram">
                          {/* Icon changes based on equipment */}
                          {(!ex.equipment || ex.equipment === "Barbell" || ex.equipment === "EZ Bar" || ex.equipment === "Smith Machine") && (
                            <svg width="16" height="10" viewBox="0 0 32 14" fill="none">
                              <rect x="0" y="5" width="4" height="4" rx="1" fill="#888"/>
                              <rect x="4" y="3" width="3" height="8" rx="1" fill="#666"/>
                              <rect x="7" y="6" width="18" height="2" rx="1" fill="#777"/>
                              <rect x="25" y="3" width="3" height="8" rx="1" fill="#666"/>
                              <rect x="28" y="5" width="4" height="4" rx="1" fill="#888"/>
                            </svg>
                          )}
                          {ex.equipment === "Dumbbells" && (
                            <svg width="16" height="12" viewBox="0 0 32 16" fill="none">
                              <circle cx="5" cy="8" r="4" fill="#666"/><rect x="9" y="6" width="14" height="4" rx="1" fill="#555"/><circle cx="27" cy="8" r="4" fill="#666"/>
                            </svg>
                          )}
                          {(ex.equipment === "Machine" || ex.equipment === "Cable") && (
                            <svg width="12" height="16" viewBox="0 0 16 22" fill="none">
                              <rect x="2" y="0" width="12" height="3" rx="1" fill="#888"/>
                              <rect x="2" y="5" width="12" height="3" rx="1" fill="#777"/>
                              <rect x="2" y="10" width="12" height="3" rx="1" fill="#666"/>
                              <rect x="2" y="15" width="12" height="3" rx="1" fill="#555" opacity="0.6"/>
                              <rect x="6" y="3" width="4" height="2" rx="0" fill="#444"/>
                            </svg>
                          )}
                          {ex.equipment === "Kettlebell" && (
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                              <path d="M4 8 Q4 3 10 3 Q16 3 16 8" stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round"/>
                              <circle cx="10" cy="13" r="5" fill="#666"/>
                            </svg>
                          )}
                          {(ex.equipment === "Bodyweight" || ex.equipment === "Resistance Band") && (
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#888" }}>accessibility_new</span>
                          )}
                          {ex.equipment === "Resistance Band" && (
                            <svg width="14" height="10" viewBox="0 0 20 14" fill="none">
                              <path d="M2 7 Q5 2 10 7 Q15 12 18 7" stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            </svg>
                          )}
                        </button>
                      )}
                      {/* Search */}
                      {ex.type !== "cardio" && (
                        <button onClick={() => openSearch(ei)}
                          className="border-none cursor-pointer shrink-0 flex items-center justify-center rounded-lg"
                          style={{ width: 30, height: 30, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#a78bfa" }}>search</span>
                        </button>
                      )}
                      {/* Ghost / demo */}
                      {(ex.name || "").trim().length > 2 && (
                        <button onClick={() => setDemoExercise(ex.name)}
                          className="border-none cursor-pointer shrink-0 flex items-center justify-center rounded-lg"
                          style={{ width: 30, height: 30, background: "rgba(120,70,20,0.25)", border: "1px solid rgba(180,100,30,0.35)" }}>
                          <svg width="14" height="14" viewBox="0 0 64 64" fill="none"><path d="M 12 32 A 20 20 0 0 1 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="#d97706" fillOpacity="0.9"/><circle cx="24" cy="29" r="3.5" fill="#1a0a00"/><circle cx="40" cy="29" r="3.5" fill="#1a0a00"/></svg>
                        </button>
                      )}
                      {/* PR badge with wings — always gold */}
                      {ex.type !== "cardio" && ex.name.trim() && (
                        <div className="shrink-0" style={{ position: "relative", width: 38, height: 34 }}>
                          <svg width="38" height="34" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                              <linearGradient id={`prGold${ei}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#fde68a"/>
                                <stop offset="50%" stopColor="#f59e0b"/>
                                <stop offset="100%" stopColor="#92400e"/>
                              </linearGradient>
                              <filter id={`glow${ei}`} x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                              </filter>
                            </defs>
                            {/* Left wing feathers */}
                            <path d="M9 17 C5 15 1 11 2 7 C4 11 6 14 9 17Z" fill="#fde68a" opacity="0.9"/>
                            <path d="M9 20 C4 18 0 15 1 10 C4 14 7 17 9 20Z" fill="#f59e0b" opacity="0.7"/>
                            <path d="M10 23 C5 21 1 19 2 14 C5 18 8 21 10 23Z" fill="#d97706" opacity="0.5"/>
                            {/* Right wing feathers */}
                            <path d="M29 17 C33 15 37 11 36 7 C34 11 32 14 29 17Z" fill="#fde68a" opacity="0.9"/>
                            <path d="M29 20 C34 18 38 15 37 10 C34 14 31 17 29 20Z" fill="#f59e0b" opacity="0.7"/>
                            <path d="M28 23 C33 21 37 19 36 14 C33 18 30 21 28 23Z" fill="#d97706" opacity="0.5"/>
                            {/* Shield body */}
                            <path d="M12 6 L26 6 L26 21 Q19 28 12 21Z" fill={`url(#prGold${ei})`} filter={`url(#glow${ei})`}/>
                            <path d="M12 6 L26 6 L26 21 Q19 28 12 21Z" fill="none" stroke="#fde68a" strokeWidth="0.8" opacity="0.7"/>
                            {/* Crown */}
                            <path d="M12 7 L14 4 L17 6.5 L19 3 L21 6.5 L24 4 L26 7" stroke="#fde68a" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            {/* PR! text */}
                            <text x="19" y="19" textAnchor="middle" fill="#fff" fontSize="7.5" fontWeight="900" fontFamily="system-ui,sans-serif" letterSpacing="0.5">PR!</text>
                          </svg>
                          {/* Ambient glow */}
                          <div style={{ position: "absolute", inset: -4, borderRadius: 10, background: "radial-gradient(ellipse,rgba(251,191,36,0.18) 0%,transparent 70%)", pointerEvents: "none" }} />
                        </div>
                      )}
                      {session.exercises.length > 1 && (
                        <button onClick={() => removeEx(ei)} className="border-none bg-transparent cursor-pointer shrink-0">
                          <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#444" }}>close</span>
                        </button>
                      )}
                    </div>

                    {/* Strength/Cardio toggle */}
                    <div className="flex gap-1.5 mx-3 mb-2">
                      {(["strength","cardio"] as const).map((t) => {
                        const active = (ex.type ?? "strength") === t;
                        return (
                          <button key={t} onClick={() => setExType(ei, t)} className="flex-1 py-2 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center justify-center gap-1"
                            style={{ background: active ? (t === "cardio" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.03)", color: active ? (t === "cardio" ? "#22c55e" : "#f2f2f2") : "#444", border: `1px solid ${active ? (t === "cardio" ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.06)"}` }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{t === "strength" ? "fitness_center" : "directions_run"}</span>
                            {t === "strength" ? "Strength" : "Cardio"}
                          </button>
                        );
                      })}
                    </div>

                    {ex.type === "cardio" ? (
                      <div className="px-3 pb-3">
                        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: "none" }}>
                          {CARDIO_PRESETS.map((p) => (
                            <button key={p.name} onClick={() => setExName(ei, p.name)} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border-none cursor-pointer shrink-0"
                              style={{ background: ex.name === p.name ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)", color: ex.name === p.name ? "#22c55e" : "#555", border: `1px solid ${ex.name === p.name ? "rgba(34,197,94,0.4)" : "transparent"}` }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{p.icon}</span>{p.name}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Duration (min)", field: "durationMins" as const, v: ex.cardio?.durationMins || "" },
                            { label: `Distance (${useKg ? "km" : "mi"})`, field: "distanceKm" as const, v: ex.cardio?.distanceKm ? (useKg ? ex.cardio.distanceKm : Math.round(ex.cardio.distanceKm * 0.621371 * 10) / 10) : "" },
                            { label: "Calories", field: "calories" as const, v: ex.cardio?.calories || "" },
                          ].map(({ label, field, v }) => (
                            <div key={field} className="flex flex-col gap-1">
                              <span className="text-[10px] text-center font-semibold" style={{ color: "#444" }}>{label}</span>
                              <input type="number" value={v} min={0} placeholder="0"
                                onChange={(e) => { const raw = Number(e.target.value); setCardioField(ei, field, field === "distanceKm" && !useKg ? Math.round((raw / 0.621371) * 100) / 100 : raw); }}
                                className="px-2 py-2 rounded-lg outline-none text-sm text-center"
                                style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Equipment chips */}
                        <div className="flex gap-1.5 overflow-x-auto mx-3 mb-2 pb-1" style={{ scrollbarWidth: "none" }}>
                          {EQUIPMENT.map((eq) => {
                            const active = ex.equipment === eq.label;
                            return (
                              <button key={eq.label} onClick={() => setEquipment(ei, eq.label)} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border-none cursor-pointer shrink-0"
                                style={{ background: active ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: active ? "#c4b5fd" : "#444", border: `1px solid ${active ? "rgba(167,139,250,0.4)" : "transparent"}` }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{eq.icon}</span>{eq.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Stats bar */}
                        {ex.name.trim() && (prKg !== null || prevSets.length > 0) && (
                          <div className="flex items-center justify-between mx-3 mb-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            {prKg !== null ? <span className="text-[11px]" style={{ color: "#888" }}>Best: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{toDisplay(prKg, useKg)} {unitLabel}</span></span> : <span />}
                            {prevSets.length > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}>
                                Prev. Workout: {toDisplay(prevSets[0].weight, useKg)} × {prevSets[0].reps} (Last)
                              </span>
                            )}
                            {prKg !== null ? <span className="text-[11px]" style={{ color: "#888" }}>Best: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{toDisplay(prKg, useKg)} {unitLabel}</span> (Max)</span> : <span />}
                          </div>
                        )}

                        {/* Column headers */}
                        <div className="flex text-[10px] font-bold mb-1 mx-3 gap-2" style={{ color: "#444" }}>
                          <span style={{ width: 28 }}>#</span>
                          <span className="flex-1 text-center">Reps</span>
                          <span className="flex-1 text-center">{unitLabel}</span>
                          <span style={{ width: 30 }} /><span style={{ width: 18 }} />
                        </div>

                        {/* Set rows */}
                        {(ex.sets||[]).map((set, si) => {
                          const prevSet = prevSets[si];
                          const isFocused = focusedSi === si;
                          const sType = set.setType ?? "S";
                          const inputBg = set.done ? "rgba(34,197,94,0.08)" : isFocused ? "rgba(255,255,255,0.08)" : "#222";
                          const inputBorder = set.done ? "rgba(34,197,94,0.35)" : isFocused ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)";
                          return (
                            <div key={si} className="flex items-start gap-2 mx-3 mb-1" onClick={() => setFocusedSet({ ei, si })}>
                              {/* Set type badge */}
                              <button onClick={(e) => { e.stopPropagation(); cycleSetType(ei, si); }}
                                className="flex items-center justify-center rounded-lg text-xs font-black border-none cursor-pointer shrink-0 mt-0.5"
                                style={{ width: 30, height: 38, background: isFocused ? SET_TYPE_COLOR[sType] + "30" : SET_TYPE_COLOR[sType] + "15", color: SET_TYPE_COLOR[sType], border: `1.5px solid ${SET_TYPE_COLOR[sType]}${isFocused ? "70" : "40"}` }}>
                                {sType}
                              </button>
                              {/* Reps */}
                              <div className="flex-1 flex flex-col gap-0.5">
                                <input ref={(el) => { inputRefs.current[`${ei}-${si}-reps`] = el; }}
                                  type="number" value={set.reps} min={0}
                                  onChange={(e) => setField(ei, si, "reps", Number(e.target.value))}
                                  onFocus={() => setFocusedSet({ ei, si })}
                                  className="w-full px-2 py-2 rounded-lg outline-none text-sm font-semibold text-center"
                                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: set.done ? "#22c55e" : "#f2f2f2" }} />
                                {prevSet && <span className="text-[9px] text-center" style={{ color: "#404040" }}>Prev: {prevSet.reps}</span>}
                              </div>
                              {/* Weight */}
                              <div className="flex-1 flex flex-col gap-0.5">
                                <input type="number" value={toDisplay(set.weight, useKg)} min={0} step={useKg ? 0.5 : 1}
                                  onChange={(e) => setField(ei, si, "weight", Number(e.target.value))}
                                  onFocus={() => setFocusedSet({ ei, si })}
                                  className="w-full px-2 py-2 rounded-lg outline-none text-sm font-semibold text-center"
                                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: set.done ? "#22c55e" : "#f2f2f2" }} />
                                {prevSet && <span className="text-[9px] text-center" style={{ color: "#404040" }}>Prev: {toDisplay(prevSet.weight, useKg)}</span>}
                              </div>
                              {/* Checkmark */}
                              <button onClick={(e) => { e.stopPropagation(); toggleDone(ei, si); }}
                                className="shrink-0 mt-0.5 flex items-center justify-center rounded-lg border-none cursor-pointer"
                                style={{ width: 36, height: 36, border: `2px solid ${set.done ? "#22c55e" : "#3a3a3a"}`, background: set.done ? "#22c55e" : "transparent" }}>
                                {set.done
                                  ? <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#000", fontVariationSettings: "'FILL' 1,'wght' 700" }}>check</span>
                                  : <span style={{ width: 10, height: 10, borderRadius: 3, border: "1.5px solid #4a4a4a", display: "block" }} />}
                              </button>
                              {/* Remove */}
                              <button onClick={(e) => { e.stopPropagation(); removeSet(ei, si); }} className="border-none bg-transparent cursor-pointer shrink-0 mt-2">
                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#3a3a3a" }}>remove</span>
                              </button>
                            </div>
                          );
                        })}


                        {/* Rest timer — solid green bar like spec */}
                        <div className="flex items-center justify-between mx-3 mb-2 px-4 py-3 rounded-xl"
                          style={{ background: restActive ? "rgba(20,83,45,0.6)" : "#1e1e1e", border: `1px solid ${restActive ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.06)"}` }}>
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: restActive ? "#22c55e" : "#444" }}>self_improvement</span>
                            <span className="text-sm font-bold tabular-nums" style={{ color: restActive ? "#22c55e" : "#555" }}>
                              {restActive ? "Rest — " : "Rest timer"}
                              {restActive && <span ref={el => { restDomRefs.current[0] = el; }}>{fmtTimer(restSecsValRef.current)}</span>}
                            </span>
                          </div>
                          {restActive ? (
                            <button onClick={() => { setRestActive(false); restSecsValRef.current = 0; }}
                              className="text-sm font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "rgba(180,83,9,0.35)", color: "#f97316" }}>Done</button>
                          ) : (
                            <button onClick={() => { restSecsValRef.current = 0; setRestActive(true); }}
                              className="text-sm font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>Start</button>
                          )}
                        </div>

                        <button onClick={() => addSet(ei)} className="mx-3 mb-3 flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span> Add set
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-2">
                <button onClick={addEx} className="flex-1 py-2.5 rounded-xl text-sm border-none cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#888", border: "1px dashed rgba(255,255,255,0.12)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span> Add Exercise
                </button>
                <button onClick={addCardio} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px dashed rgba(34,197,94,0.3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>directions_run</span> Add Cardio
                </button>
              </div>
              <textarea placeholder="Notes…" value={session.notes} rows={2}
                onChange={(e) => mutate((s) => ({ ...s, notes: e.target.value }))}
                className="w-full mt-2 px-3 py-2.5 rounded-xl outline-none text-sm resize-none"
                style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
            </div>
          </div>
        ) : (
          <>
            {!loading && logs.length > 0 && logs[0].date && (Date.now() - logs[0].date.seconds * 1000) > 7 * 86400000 && (() => {
              const daysSince = Math.floor((Date.now() - logs[0].date!.seconds * 1000) / 86400000);
              return (
                <div className="rounded-2xl p-4 mb-3" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f97316" }}>local_fire_department</span>
                    <span className="text-sm font-bold" style={{ color: "#f97316" }}>Welcome Back 🔥</span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "#888" }}>It&apos;s been <span style={{ color: "#f2f2f2", fontWeight: 600 }}>{daysSince} days</span> since your last workout.</p>
                  <button onClick={() => startWorkout()} className="w-full py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer" style={{ background: "#f97316", color: "#fff" }}>Start Comeback Workout</button>
                </div>
              );
            })()}
            <div className="flex flex-col items-center py-6 mb-4 rounded-2xl gap-3" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-full px-4">
                <p className="text-xs text-center mb-2.5" style={{ color: "#555" }}>How are you feeling today?</p>
                <div className="flex gap-1.5 justify-center flex-wrap">
                  {[{emoji:"💪",label:"Energized"},{emoji:"😊",label:"Good"},{emoji:"😑",label:"Meh"},{emoji:"😴",label:"Tired"},{emoji:"😤",label:"Stressed"}].map((m) => (
                    <button key={m.label} onClick={() => setMood(mood === m.label ? null : m.label)}
                      className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl border-none cursor-pointer text-xs font-semibold"
                      style={{ background: mood === m.label ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: mood === m.label ? "#c4b5fd" : "#555", border: `1px solid ${mood === m.label ? "rgba(167,139,250,0.4)" : "transparent"}` }}>
                      <span className="text-base">{m.emoji}</span><span className="text-[10px]">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => startWorkout()} className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff", boxShadow: "0 0 20px rgba(34,197,94,0.35)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                Start Workout
              </button>
            </div>
          </>
        )}

        {/* ── Workout Log History ── */}
        {loading ? (
          <div className="flex justify-center py-10"><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm py-8" style={{ color: "#555" }}>No workouts logged yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {logs.map((log) => {
              const vol = totalVol(log);
              const isVolPr = vol > 0 && vol >= maxHistVol;
              const hasPr = (log.exercises||[]).some((ex) => !ex.type || ex.type !== "cardio" ? is1RmPr(ex.name, Math.max(0,...(ex.sets||[]).map((s)=>s.weight))) : false);

              return (
                <div key={log.id} className="rounded-2xl overflow-hidden"
                  style={{ background: "#131313", border: `1px solid ${isVolPr ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.07)"}` }}>

                  {/* Session header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div>
                      <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{log.date ? fmtDate(log.date.seconds) : "Today"}</span>
                      {log.durationMins && <span className="text-sm ml-2" style={{ color: "#555" }}>{log.durationMins}m duration</span>}
                    </div>
                    {isVolPr && (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1"
                        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                        🏆 GOLD VOLUME PR
                      </span>
                    )}
                    {!isVolPr && hasPr && (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>🏆 PR</span>
                    )}
                  </div>

                  {/* Exercise rows */}
                  <div className="px-4 py-3 flex flex-col gap-3">
                    {(log.exercises||[]).map((ex, i) => {
                      const isCardio = ex.type === "cardio";
                      const sets = ex.sets || [];
                      const maxW = sets.length ? Math.max(...sets.map((s) => s.weight)) : 0;
                      const exIs1Rm = !isCardio && is1RmPr(ex.name, maxW);
                      const hasBorder = exIs1Rm;

                      // Group sets
                      type Group = { count: number; reps: number; weight: number; is1rm: boolean; isSRP: boolean };
                      const groups: Group[] = [];
                      for (const s of sets) {
                        const g1rm = is1RmPr(ex.name, s.weight);
                        const gSrp = isSetRepPr(ex.name, s.weight, s.reps);
                        const last = groups.at(-1);
                        if (last && last.reps === s.reps && Math.abs(last.weight - s.weight) < 0.01 && last.is1rm === g1rm && last.isSRP === gSrp) {
                          last.count++;
                        } else {
                          groups.push({ count: 1, reps: s.reps, weight: s.weight, is1rm: g1rm, isSRP: gSrp });
                        }
                      }

                      return (
                        <div key={i} className="flex gap-2" style={{ borderLeft: hasBorder ? "3px solid #fbbf24" : "3px solid transparent", paddingLeft: 8 }}>
                          {/* Left: name + equipment + PR label */}
                          <div style={{ minWidth: 90, maxWidth: 110, flexShrink: 0 }}>
                            <p className="text-sm font-bold leading-tight" style={{ color: hasBorder ? "#f2f2f2" : "#bbb" }}>{ex.name}</p>
                            {ex.equipment && (
                              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>{ex.equipment}</span>
                            )}
                            {isCardio && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>Cardio</span>}
                            {exIs1Rm && !ex.equipment && <p className="text-[10px] font-bold mt-0.5" style={{ color: "#fbbf24" }}>PR</p>}
                            {exIs1Rm && ex.equipment && <p className="text-[10px] font-bold mt-0.5" style={{ color: "#fbbf24" }}>PR</p>}
                          </div>

                          {/* Right: set groups with PR badges */}
                          <div className="flex-1 min-w-0">
                            {isCardio && ex.cardio ? (
                              <span className="text-xs" style={{ color: "#555" }}>
                                {[ex.cardio.durationMins ? `${ex.cardio.durationMins}min` : null, ex.cardio.distanceKm ? `${useKg ? ex.cardio.distanceKm : Math.round(ex.cardio.distanceKm * 0.621371 * 10) / 10}${useKg ? "km" : "mi"}` : null, ex.cardio.calories ? `${ex.cardio.calories}kcal` : null].filter(Boolean).join(" · ")}
                              </span>
                            ) : groups.length === 0 ? (
                              <span className="text-xs" style={{ color: "#444" }}>—</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {groups.map((g, gi) => (
                                  <div key={gi} className="flex items-center justify-between gap-2">
                                    <span className="text-xs" style={{ color: g.is1rm || g.isSRP ? "#f2f2f2" : "#666" }}>
                                      {g.is1rm || g.isSRP ? "$" : ""}{g.count} × {g.reps}{g.weight > 0 ? ` @ ${toDisplay(g.weight, useKg)} ${unitLabel}` : ""}
                                    </span>
                                    {g.is1rm && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>🥇 1-REP MAX PR</span>
                                    )}
                                    {!g.is1rm && g.isSRP && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>🥇 SET REP PR</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Volume footer */}
                  {vol > 0 && (
                    <div className="flex items-center justify-between px-4 pb-3">
                      <p className="text-xs" style={{ color: "#555" }}>{Math.round(useKg ? vol : vol * KG_TO_LBS).toLocaleString()} {unitLabel} volume</p>
                      {isVolPr && (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>🏆 GOLD VOLUME PR</span>
                      )}
                    </div>
                  )}
                  {log.notes && <p className="text-xs px-4 pb-3 italic" style={{ color: "#444" }}>{log.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weight Visualizer Modal */}
      {barbellModal && (() => {
        const { name, weightLbs, equipment } = barbellModal;
        const isBarbell = !equipment || equipment === "Barbell" || equipment === "EZ Bar" || equipment === "Smith Machine";
        const isDumbbells = equipment === "Dumbbells";
        const isMachine = equipment === "Machine" || equipment === "Cable";
        const isKettlebell = equipment === "Kettlebell";
        const isBodyweight = equipment === "Bodyweight";
        const isBand = equipment === "Resistance Band";
        const plates = isBarbell ? calcPlates(weightLbs) : [];
        const totalBarbell = 45 + plates.reduce((s, p) => s + p * 2, 0);
        const hasWeight = weightLbs > 0;
        const plateColor: Record<number, { bg: string; text: string; label: string }> = {
          45: { bg: "#dc2626", text: "#fff", label: "red" },
          35: { bg: "#2563eb", text: "#fff", label: "blue" },
          25: { bg: "#16a34a", text: "#fff", label: "green" },
          10: { bg: "#ca8a04", text: "#fff", label: "yellow" },
          5:  { bg: "#9333ea", text: "#fff", label: "purple" },
          2.5:{ bg: "#0891b2", text: "#fff", label: "cyan" },
        };

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setBarbellModal(null)}>
            <div className="w-full flex flex-col overflow-y-auto" style={{ background: "linear-gradient(180deg,#111 0%,#0a0a0a 100%)", height: "70vh", borderRadius: "24px 24px 0 0" }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div>
                  <p className="text-[10px] font-bold tracking-widest mb-0.5" style={{ color: "#555" }}>{equipment?.toUpperCase() || "BARBELL"}</p>
                  <h3 className="text-xl font-black" style={{ color: "#f2f2f2" }}>
                    {isBarbell ? "Barbell Loading" : isDumbbells ? "Dumbbell" : isMachine ? (equipment === "Cable" ? "Cable" : "Machine") : isKettlebell ? "Kettlebell" : isBodyweight ? "Bodyweight" : "Resistance Band"}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "#444" }}>{name}</p>
                </div>
                <button onClick={() => setBarbellModal(null)} className="border-none cursor-pointer flex items-center justify-center rounded-full"
                  style={{ width: 32, height: 32, background: "rgba(255,255,255,0.06)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#666" }}>close</span>
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 20px" }} />

              <div className="px-5 py-5">

                {/* ── BARBELL ── */}
                {isBarbell && (hasWeight ? (
                  <>
                    {/* Barbell diagram */}
                    <div className="flex items-center justify-center mb-5" style={{ minHeight: 80 }}>
                      {/* Left sleeve + plates */}
                      <div style={{ width: 16, height: 20, background: "#555", borderRadius: "3px 0 0 3px", marginRight: 1 }} />
                      <div className="flex items-center" style={{ gap: 2 }}>
                        {[...plates].reverse().map((p, i) => {
                          const h = p >= 45 ? 70 : p >= 35 ? 60 : p >= 25 ? 52 : p >= 10 ? 42 : p >= 5 ? 34 : 26;
                          const c = plateColor[p] || { bg: "#444", text: "#fff" };
                          return (
                            <div key={i} className="flex items-center justify-center rounded-sm" style={{ width: 18, height: h, background: c.bg, boxShadow: `0 0 6px ${c.bg}55`, position: "relative" }}>
                              <span style={{ fontSize: 7, color: c.text, fontWeight: 900, writingMode: "vertical-rl", textOrientation: "mixed", letterSpacing: 0 }}>{p}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Bar */}
                      <div style={{ width: 70, height: 10, background: "linear-gradient(180deg,#999 0%,#666 50%,#888 100%)", borderRadius: 2, boxShadow: "0 2px 6px rgba(0,0,0,0.6)", flexShrink: 0 }} />
                      {/* Right plates */}
                      <div className="flex items-center" style={{ gap: 2 }}>
                        {plates.map((p, i) => {
                          const h = p >= 45 ? 70 : p >= 35 ? 60 : p >= 25 ? 52 : p >= 10 ? 42 : p >= 5 ? 34 : 26;
                          const c = plateColor[p] || { bg: "#444", text: "#fff" };
                          return (
                            <div key={i} className="flex items-center justify-center rounded-sm" style={{ width: 18, height: h, background: c.bg, boxShadow: `0 0 6px ${c.bg}55` }}>
                              <span style={{ fontSize: 7, color: c.text, fontWeight: 900, writingMode: "vertical-rl", letterSpacing: 0 }}>{p}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ width: 16, height: 20, background: "#555", borderRadius: "0 3px 3px 0", marginLeft: 1 }} />
                    </div>

                    {/* Total weight */}
                    <div className="text-center mb-4">
                      <p className="text-4xl font-black" style={{ color: "#f2f2f2", letterSpacing: -1 }}>{totalBarbell} <span className="text-lg" style={{ color: "#555" }}>lbs</span></p>
                      <p className="text-xs mt-1" style={{ color: "#444" }}>45 lb bar included</p>
                    </div>

                    {/* Plate breakdown */}
                    <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>PLATES PER SIDE</p>
                      <div className="flex flex-wrap gap-1.5">
                        {plates.map((p, i) => {
                          const c = plateColor[p] || { bg: "#444", text: "#fff" };
                          return (
                            <span key={i} className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: c.bg + "25", color: c.bg, border: `1px solid ${c.bg}50` }}>{p} lb</span>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-8 gap-5">
                    {/* Phantom barbell */}
                    <div className="flex items-center opacity-20">
                      <div style={{ width: 14, height: 18, background: "#555", borderRadius: "3px 0 0 3px" }} />
                      <div className="flex items-center" style={{ gap: 2 }}>
                        {[52, 42, 30].map((h, i) => <div key={i} style={{ width: 16, height: h, background: "#444", borderRadius: 2 }} />)}
                      </div>
                      <div style={{ width: 60, height: 10, background: "#666", borderRadius: 2 }} />
                      <div className="flex items-center" style={{ gap: 2 }}>
                        {[30, 42, 52].map((h, i) => <div key={i} style={{ width: 16, height: h, background: "#444", borderRadius: 2 }} />)}
                      </div>
                      <div style={{ width: 14, height: 18, background: "#555", borderRadius: "0 3px 3px 0" }} />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold mb-1" style={{ color: "#555" }}>No weight entered yet</p>
                      <p className="text-sm" style={{ color: "#3a3a3a" }}>Add a weight to your set and the</p>
                      <p className="text-sm" style={{ color: "#3a3a3a" }}>plate loading diagram will appear here</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {["45 lb", "35 lb", "25 lb", "10 lb"].map((p) => (
                        <span key={p} className="px-2 py-1 rounded-lg text-xs font-bold" style={{ background: "rgba(255,255,255,0.04)", color: "#333", border: "1px solid rgba(255,255,255,0.06)" }}>{p}</span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* ── DUMBBELLS ── */}
                {isDumbbells && (
                  <div className="flex flex-col items-center gap-4">
                    {/* Dumbbell visual */}
                    <div className="flex items-center gap-2">
                      {/* Left dumbbell */}
                      <svg width="110" height="44" viewBox="0 0 110 44" fill="none">
                        <rect x="0" y="14" width="22" height="16" rx="4" fill="#333" stroke="#4a4a4a" strokeWidth="1"/>
                        <rect x="22" y="19" width="8" height="6" rx="1" fill="#444"/>
                        <rect x="30" y="10" width="50" height="24" rx="6" fill="#222" stroke="#3a3a3a" strokeWidth="1"/>
                        <text x="55" y="27" textAnchor="middle" fill="#f2f2f2" fontSize={hasWeight && weightLbs >= 100 ? "10" : "12"} fontWeight="900" fontFamily="system-ui">{hasWeight ? weightLbs : "—"}</text>
                        <rect x="80" y="19" width="8" height="6" rx="1" fill="#444"/>
                        <rect x="88" y="14" width="22" height="16" rx="4" fill="#333" stroke="#4a4a4a" strokeWidth="1"/>
                      </svg>
                    </div>
                    <div className="text-center">
                      {hasWeight ? (
                        <>
                          <p className="text-3xl font-black mb-0.5" style={{ color: "#f2f2f2" }}>{weightLbs} <span className="text-base" style={{ color: "#555" }}>lbs each</span></p>
                          <p className="text-sm" style={{ color: "#444" }}>Combined total: <span style={{ color: "#f2f2f2", fontWeight: 700 }}>{weightLbs * 2} lbs</span></p>
                        </>
                      ) : (
                        <p className="text-sm" style={{ color: "#555" }}>Enter a weight to see dumbbell info</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── MACHINE / CABLE ── */}
                {isMachine && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex gap-4 items-center">
                      {/* Weight stack */}
                      <div className="flex flex-col gap-1 items-center">
                        <p className="text-[9px] font-bold tracking-widest mb-1" style={{ color: "#444" }}>STACK</p>
                        {Array.from({ length: 12 }).map((_, i) => {
                          const filled = hasWeight && i < Math.min(Math.round(weightLbs / 10), 12);
                          return (
                            <div key={i} className="rounded" style={{ width: 72, height: 7, background: filled ? "linear-gradient(90deg,#a78bfa,#7c3aed)" : "#1e1e1e", border: `1px solid ${filled ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.04)"}`, transition: "all 0.15s" }} />
                          );
                        })}
                      </div>
                      {/* Cable / pulley visual */}
                      <div className="flex flex-col items-center gap-2">
                        <div className="rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: "#1a1a1a", border: "2px solid #333" }}>
                          <div className="rounded-full" style={{ width: 12, height: 12, background: "#444" }} />
                        </div>
                        <div style={{ width: 2, height: 40, background: "linear-gradient(180deg,#555,#a78bfa)", borderRadius: 1 }} />
                        <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 24, background: "#2a2a2a", border: "1px solid #444" }}>
                          <span style={{ fontSize: 8, color: "#888", fontWeight: 700 }}>GRIP</span>
                        </div>
                      </div>
                    </div>
                    {hasWeight ? (
                      <p className="text-3xl font-black" style={{ color: "#f2f2f2" }}>{weightLbs} <span className="text-base" style={{ color: "#555" }}>lbs</span></p>
                    ) : (
                      <p className="text-sm" style={{ color: "#555" }}>Enter a weight in your set</p>
                    )}
                    <p className="text-xs" style={{ color: "#3a3a3a" }}>{equipment} · Set pin to corresponding number on the stack</p>
                  </div>
                )}

                {/* ── KETTLEBELL ── */}
                {isKettlebell && (
                  <div className="flex flex-col items-center gap-3">
                    <svg width="110" height="120" viewBox="0 0 110 120" fill="none">
                      <defs>
                        <radialGradient id="kbGrad" cx="40%" cy="35%" r="60%">
                          <stop offset="0%" stopColor="#3a3a3a"/>
                          <stop offset="100%" stopColor="#111"/>
                        </radialGradient>
                      </defs>
                      {/* Handle */}
                      <path d="M38 52 Q38 18 55 18 Q72 18 72 52" stroke="#555" strokeWidth="10" fill="none" strokeLinecap="round"/>
                      <path d="M38 52 Q38 18 55 18 Q72 18 72 52" stroke="#333" strokeWidth="8" fill="none" strokeLinecap="round"/>
                      {/* Body */}
                      <circle cx="55" cy="78" r="36" fill="url(#kbGrad)" stroke="#3a3a3a" strokeWidth="2"/>
                      <circle cx="47" cy="68" r="8" fill="rgba(255,255,255,0.03)"/>
                      {hasWeight && <text x="55" y="84" textAnchor="middle" fill="#f2f2f2" fontSize={weightLbs >= 100 ? "16" : "20"} fontWeight="900" fontFamily="system-ui">{weightLbs}</text>}
                      {hasWeight && <text x="55" y="96" textAnchor="middle" fill="#555" fontSize="9" fontFamily="system-ui">LBS</text>}
                    </svg>
                    {hasWeight ? (
                      <p className="text-2xl font-black" style={{ color: "#f2f2f2" }}>{weightLbs} lbs</p>
                    ) : (
                      <p className="text-sm" style={{ color: "#555" }}>Enter a weight to see kettlebell info</p>
                    )}
                  </div>
                )}

                {/* ── BODYWEIGHT ── */}
                {isBodyweight && (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <div className="flex items-center justify-center rounded-2xl" style={{ width: 80, height: 80, background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.2)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>accessibility_new</span>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-black" style={{ color: "#f2f2f2" }}>Bodyweight</p>
                      {hasWeight && <p className="text-sm mt-1" style={{ color: "#aaa" }}>+ {weightLbs} lbs added load</p>}
                      <p className="text-xs mt-1" style={{ color: "#444" }}>Use your body as the resistance</p>
                    </div>
                  </div>
                )}

                {/* ── RESISTANCE BAND ── */}
                {isBand && (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <svg width="160" height="70" viewBox="0 0 160 70" fill="none">
                      <path d="M10 35 Q40 5 80 35 Q120 65 150 35" stroke="#a78bfa" strokeWidth="5" fill="none" strokeLinecap="round"/>
                      <path d="M10 35 Q40 65 80 35 Q120 5 150 35" stroke="#7c3aed" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.6"/>
                      <circle cx="10" cy="35" r="5" fill="#a78bfa"/>
                      <circle cx="150" cy="35" r="5" fill="#a78bfa"/>
                    </svg>
                    {hasWeight ? (
                      <p className="text-2xl font-black" style={{ color: "#f2f2f2" }}>{weightLbs} lbs resistance</p>
                    ) : (
                      <p className="text-sm" style={{ color: "#555" }}>Enter resistance in lbs equivalent</p>
                    )}
                    <p className="text-xs" style={{ color: "#3a3a3a" }}>Light ≈ 5–15 lbs · Medium ≈ 15–35 lbs · Heavy ≈ 35–65 lbs</p>
                  </div>
                )}

              </div>

              {/* Safe area spacer */}
              <div style={{ height: "env(safe-area-inset-bottom,16px)" }} />
            </div>
          </div>
        );
      })()}

      {/* Search sheet */}
      {searchOpen !== null && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={(e) => { if (e.target === e.currentTarget) closeSearch(); }}>
          <div className="mt-auto rounded-t-3xl flex flex-col" style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "80vh" }}>
            <div className="flex justify-center pt-3 pb-1"><div className="rounded-full" style={{ width: 36, height: 4, background: "rgba(255,255,255,0.12)" }} /></div>
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555" }}>search</span>
                <input autoFocus type="text" placeholder="Search exercises or muscle group…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 outline-none bg-transparent text-sm" style={{ color: "#f2f2f2" }} />
                {searchQuery.length > 0 && <button onClick={() => setSearchQuery("")} className="border-none bg-transparent cursor-pointer p-0"><span className="material-symbols-outlined" style={{ fontSize: 16, color: "#555" }}>close</span></button>}
              </div>
            </div>
            <div className="overflow-y-auto px-4 pb-8 flex flex-col gap-1">
              {searchLoading && <p className="text-xs text-center py-6" style={{ color: "#555" }}>Searching…</p>}
              {searchQuery.length >= 2 && (
                <button onClick={() => pickExercise(searchQuery)} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl border-none cursor-pointer text-left mb-1" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 17, color: "#a78bfa" }}>edit</span>
                  <p className="text-sm font-semibold" style={{ color: "#a78bfa" }}>Use &quot;{searchQuery}&quot;</p>
                </button>
              )}
              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#555" }}>No matching exercises found</p>}
              {!searchLoading && searchQuery.length < 2 && <p className="text-xs text-center py-6" style={{ color: "#444" }}>Type to search or enter your own exercise name</p>}
              {searchResults.map((r) => (
                <button key={r.name} onClick={() => pickExercise(r.name)} className="flex items-center justify-between w-full px-3 py-3 rounded-xl border-none cursor-pointer text-left" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div><p className="text-sm font-semibold capitalize" style={{ color: "#f2f2f2" }}>{r.name}</p><p className="text-xs capitalize mt-0.5" style={{ color: "#555" }}>{r.target} · {r.equipment}</p></div>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: "#333" }}>chevron_right</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {demoExercise && <ExerciseDemo exerciseName={demoExercise} onClose={() => setDemoExercise(null)} />}

      {/* Quick adjust — fixed floating toolbar, never shifts layout */}
      {session && focusedSet !== null && (() => {
        const { ei, si } = focusedSet;
        const activeSet = session.exercises[ei]?.sets[si];
        if (!activeSet) return null;
        return (
          <div className="fixed left-0 right-0 z-50"
            style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 122px)", background: "rgba(18,18,18,0.98)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.1)", padding: "8px 12px" }}>
            {/* Row 1: − reps weight Match Set */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <button onClick={() => setField(ei, si, "reps", Math.max(0, (activeSet.reps ?? 1) - 1))}
                className="flex items-center justify-center rounded-lg font-bold border-none cursor-pointer shrink-0 text-base"
                style={{ width: 42, height: 40, background: "#2a2a2a", color: "#f2f2f2" }}>−</button>
              <div className="flex-1 flex items-center justify-center rounded-lg font-semibold text-sm"
                style={{ height: 40, background: "#2a2a2a", color: "#f2f2f2" }}>
                {activeSet.reps ?? 0} reps
              </div>
              <div className="flex-1 flex items-center justify-center rounded-lg font-semibold text-sm"
                style={{ height: 40, background: "#2a2a2a", color: "#f2f2f2" }}>
                {toDisplay(activeSet.weight ?? 0, useKg)} {unitLabel}
              </div>
              <button onClick={() => matchSet(ei, si)}
                className="flex items-center justify-center rounded-lg text-[11px] font-bold border-none cursor-pointer shrink-0 text-center leading-tight"
                style={{ width: 62, height: 40, background: "rgba(167,139,250,0.18)", color: "#a78bfa" }}>
                Match{"\n"}Set
              </button>
            </div>
            {/* Row 2: weight adjustments */}
            <div className="flex items-center gap-1.5">
              {([+2.5, +2.5, +5, -2.5] as number[]).map((d, idx) => (
                <button key={idx} onClick={() => adjustWeight(ei, si, d)}
                  className="flex-1 rounded-lg text-sm font-bold border-none cursor-pointer"
                  style={{ height: 40, background: "#2a2a2a", color: "#f2f2f2" }}>
                  {d > 0 ? "+" : ""}{d}
                </button>
              ))}
              <button onClick={() => matchPrevSet(ei, si)}
                className="flex items-center justify-center rounded-lg text-[10px] font-bold border-none cursor-pointer shrink-0 text-center leading-tight"
                style={{ width: 62, height: 40, background: "rgba(167,139,250,0.18)", color: "#a78bfa" }}>
                Match Set{"\n"}Prev. Set
              </button>
            </div>
          </div>
        );
      })()}

      {/* Sticky bar */}
      {session && (
        <div className="fixed left-0 right-0 flex items-center justify-between px-4 py-3 z-40"
          style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 64px)", background: "rgba(9,9,9,0.92)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#22c55e" }}>timer</span>
            <span ref={el => { elapsedDomRefs.current[2] = el; }} className="text-sm font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{fmtTimer(elapsedValRef.current)}</span>
            <span className="text-xs" style={{ color: "#444" }}>· {session.exercises.filter((e) => (e.name||"").trim()).length} exercises</span>
          </div>
          <button onClick={endWorkout} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: saving ? "#333" : "#ef4444", color: "#fff" }}>
            {saving ? "Saving…" : "End Workout"}
          </button>
        </div>
      )}
    </div>
  );
}
