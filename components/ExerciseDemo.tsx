"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const Model = dynamic(
  () => import("react-body-highlighter").then(m => m.default),
  { ssr: false, loading: () => <div style={{ width: 130, height: 220 }} /> }
);

interface Props { exerciseName: string; onClose: () => void; }
interface ExerciseInfo {
  instructions: string[]; target: string; bodyPart: string;
  equipment: string; secondaryMuscles: string[];
}
interface BrowseItem { name: string; image: string | null; }

/* ─────────────────────────────────────────────────────────
   react-body-highlighter muscle IDs (exact strings)
   anterior:  chest | biceps | triceps | forearm | front-deltoids
              abs | obliques | adductor | abductors | quadriceps | calves
   posterior: trapezius | upper-back | lower-back | back-deltoids
              triceps | forearm | gluteal | hamstring | calves
───────────────────────────────────────────────────────── */

interface MuscleGroups {
  primaryAnt: string[];   // front body, orange
  primaryPost: string[];  // back body,  orange
  secAnt: string[];       // front body, blue
  secPost: string[];      // back body,  blue
}

/* Convert a single muscle name string → { ant[], post[] } */
function single(name: string): { ant: string[]; post: string[] } {
  const n = name.toLowerCase().trim();
  const ant: string[] = [];
  const post: string[] = [];

  // Chest / Pecs
  if (/pectoral|chest|pec\b/.test(n))                                     ant.push("chest");
  // Serratus → chest area
  if (/serratus/.test(n))                                                  ant.push("chest");

  // Biceps
  if (/bicep/.test(n))                                                     ant.push("biceps");

  // Triceps (visible on both views)
  if (/tricep/.test(n))                              { ant.push("triceps"); post.push("triceps"); }

  // Forearms
  if (/forearm|wrist/.test(n))                       { ant.push("forearm"); post.push("forearm"); }

  // Abs / Core
  if (/\babs?\b|abdominal/.test(n))                                        ant.push("abs");
  if (/oblique/.test(n))                                                   ant.push("obliques");
  // "core" alone → abs
  if (/\bcore\b/.test(n) && !(/adductor|abductor/.test(n)))               ant.push("abs");

  // Shoulders — precise order matters (specific before generic)
  if (/front.?delt|anterior.?delt|front.?shoulder/.test(n)) {
    ant.push("front-deltoids");
  } else if (/rear.?delt|back.?delt|posterior.?delt|rear.?shoulder/.test(n)) {
    post.push("back-deltoids");
  } else if (/\bdelt(s|oid)?\b|\bshoulder(s)?\b/.test(n)) {
    // generic "delts" / "shoulders" → both views
    ant.push("front-deltoids");
    post.push("back-deltoids");
  }

  // Lats
  if (/\blat(s)?\b|latissimus/.test(n))                                   post.push("upper-back");
  // Upper back
  if (/upper.?back|rhomboid/.test(n))                                     post.push("upper-back");
  // Lower back
  if (/lower.?back|erector|lumbar|\bspine\b/.test(n))                     post.push("lower-back");
  // Traps
  if (/\btrap(s|ezius)?\b|levator.?scapulae/.test(n))                     post.push("trapezius");
  // Generic "back"
  if (/\bback\b/.test(n) && !/(lower|upper)/.test(n))                     post.push("upper-back");

  // Quads / Hip flexors
  if (/quad|quadricep|upper.?leg|hip.?flex/.test(n))                      ant.push("quadriceps");
  // Hamstrings
  if (/hamstring/.test(n))                                                 post.push("hamstring");
  // Glutes
  if (/glute|gluteal|gluteus/.test(n))                                     post.push("gluteal");
  // Calves
  if (/\bcalf\b|\bcalves\b|\bsoleus\b/.test(n))  { ant.push("calves"); post.push("calves"); }
  // Adductors / Abductors
  if (/adductor/.test(n))                                                  ant.push("adductor");
  if (/abductor/.test(n))                                                  ant.push("abductors");
  // Cardio → whole legs
  if (/cardiovascular/.test(n)) {
    ant.push("quadriceps"); ant.push("calves");
    post.push("gluteal");   post.push("calves");
  }

  return { ant: [...new Set(ant)], post: [...new Set(post)] };
}

/* Build MuscleGroups from API target + secondaryMuscles */
function fromApi(target: string, secondaryMuscles: string[]): MuscleGroups {
  const p = single(target);
  const sAll = secondaryMuscles.reduce(
    (acc, m) => {
      const r = single(m);
      r.ant.forEach(x => acc.ant.add(x));
      r.post.forEach(x => acc.post.add(x));
      return acc;
    },
    { ant: new Set<string>(), post: new Set<string>() }
  );
  return {
    primaryAnt:  p.ant,
    primaryPost: p.post,
    secAnt:  [...sAll.ant].filter(m => !p.ant.includes(m)),
    secPost: [...sAll.post].filter(m => !p.post.includes(m)),
  };
}

/* ─────────────────────────────────────────────────────────
   Local exercise-name → muscle classify
   Each entry has primaryAnt/primaryPost (orange) and secAnt/secPost (blue)
───────────────────────────────────────────────────────── */
const QUICK: Array<{ re: RegExp } & MuscleGroups> = [
  // ── CHEST ───────────────────────────────────────────
  {
    re: /bench.?press|chest.?press|incline.?press|decline.?press|push.?up|pushup|incline|decline/i,
    primaryAnt: ["chest"],
    primaryPost: [],
    secAnt: ["triceps", "front-deltoids"],
    secPost: ["triceps"],
  },
  {
    re: /chest.?fly|pec.?fly|cable.?fly|cable.?crossover|crossover|flye/i,
    primaryAnt: ["chest"],
    primaryPost: [],
    secAnt: ["front-deltoids"],
    secPost: [],
  },
  // ── SHOULDERS ───────────────────────────────────────
  {
    re: /overhead.?press|shoulder.?press|ohp|military.?press|arnold.?press|seated.?press/i,
    primaryAnt: ["front-deltoids"],
    primaryPost: [],
    secAnt: ["triceps"],
    secPost: ["trapezius"],
  },
  {
    re: /lateral.?raise|side.?raise/i,
    primaryAnt: ["front-deltoids"],
    primaryPost: ["back-deltoids"],
    secAnt: [],
    secPost: ["trapezius"],
  },
  {
    re: /front.?raise/i,
    primaryAnt: ["front-deltoids"],
    primaryPost: [],
    secAnt: [],
    secPost: [],
  },
  {
    re: /upright.?row/i,
    primaryAnt: ["front-deltoids"],
    primaryPost: ["trapezius"],
    secAnt: [],
    secPost: [],
  },
  {
    re: /face.?pull|rear.?delt|reverse.?fly|reverse.?flye/i,
    primaryAnt: [],
    primaryPost: ["back-deltoids", "trapezius"],
    secAnt: [],
    secPost: ["upper-back"],
  },
  // ── TRICEPS ─────────────────────────────────────────
  {
    re: /tricep|skull.?crusher|skull|close.?grip|triceps.?pushdown|pushdown|cable.?ext|overhead.?extension|overhead.?tri/i,
    primaryAnt: ["triceps"],
    primaryPost: ["triceps"],
    secAnt: ["front-deltoids"],
    secPost: [],
  },
  {
    re: /\bdip\b/i,
    primaryAnt: ["chest", "triceps"],
    primaryPost: ["triceps"],
    secAnt: ["front-deltoids"],
    secPost: [],
  },
  // ── BACK — VERTICAL (pulldowns / pull-ups) ──────────
  {
    re: /pull.?up|chin.?up|lat.?pull.?down|pulldown/i,
    primaryAnt: [],
    primaryPost: ["upper-back"],
    secAnt: ["biceps"],
    secPost: ["trapezius"],
  },
  // ── BACK — HORIZONTAL (rows) ────────────────────────
  {
    re: /bent.?over.?row|barbell.?row|dumbbell.?row|cable.?row|seated.?row|t.?bar.?row|machine.?row/i,
    primaryAnt: [],
    primaryPost: ["upper-back"],
    secAnt: ["biceps"],
    secPost: ["trapezius", "lower-back"],
  },
  {
    re: /\brow\b/i,
    primaryAnt: [],
    primaryPost: ["upper-back"],
    secAnt: ["biceps"],
    secPost: ["trapezius"],
  },
  // ── TRAPS ───────────────────────────────────────────
  {
    re: /shrug/i,
    primaryAnt: [],
    primaryPost: ["trapezius"],
    secAnt: [],
    secPost: ["upper-back"],
  },
  // ── BICEPS ──────────────────────────────────────────
  {
    re: /bicep.?curl|barbell.?curl|dumbbell.?curl|hammer.?curl|preacher.?curl|concentration.?curl|cable.?curl|\bcurl\b/i,
    primaryAnt: ["biceps"],
    primaryPost: [],
    secAnt: ["forearm"],
    secPost: [],
  },
  // ── FOREARMS ────────────────────────────────────────
  {
    re: /wrist.?curl|reverse.?curl|forearm/i,
    primaryAnt: ["forearm"],
    primaryPost: ["forearm"],
    secAnt: [],
    secPost: [],
  },
  // ── LEGS — QUAD-DOMINANT ────────────────────────────
  {
    re: /back.?squat|front.?squat|goblet.?squat|hack.?squat|\bsquat\b/i,
    primaryAnt: ["quadriceps"],
    primaryPost: [],
    secAnt: [],
    secPost: ["gluteal", "hamstring"],
  },
  {
    re: /leg.?press/i,
    primaryAnt: ["quadriceps"],
    primaryPost: ["gluteal"],
    secAnt: [],
    secPost: ["hamstring"],
  },
  {
    re: /lunge|bulgarian|step.?up|walking.?lunge/i,
    primaryAnt: ["quadriceps"],
    primaryPost: ["gluteal"],
    secAnt: [],
    secPost: ["hamstring"],
  },
  {
    re: /leg.?extension/i,
    primaryAnt: ["quadriceps"],
    primaryPost: [],
    secAnt: [],
    secPost: [],
  },
  // ── LEGS — POSTERIOR CHAIN ──────────────────────────
  {
    re: /romanian.?deadlift|rdl|stiff.?leg.?deadlift|straight.?leg/i,
    primaryAnt: [],
    primaryPost: ["hamstring", "gluteal"],
    secAnt: [],
    secPost: ["lower-back"],
  },
  {
    re: /sumo.?deadlift/i,
    primaryAnt: ["quadriceps"],
    primaryPost: ["gluteal", "hamstring"],
    secAnt: [],
    secPost: ["lower-back"],
  },
  {
    re: /conventional.?deadlift|\bdeadlift\b/i,
    primaryAnt: [],
    primaryPost: ["hamstring", "gluteal"],
    secAnt: [],
    secPost: ["lower-back", "trapezius"],
  },
  {
    re: /good.?morning/i,
    primaryAnt: [],
    primaryPost: ["hamstring", "lower-back"],
    secAnt: [],
    secPost: ["gluteal"],
  },
  {
    re: /leg.?curl|hamstring.?curl|nordic.?curl|nordic/i,
    primaryAnt: [],
    primaryPost: ["hamstring"],
    secAnt: [],
    secPost: ["gluteal"],
  },
  // ── GLUTES ──────────────────────────────────────────
  {
    re: /hip.?thrust|glute.?bridge|\bbridge\b|donkey.?kick|cable.?kickback|glute.?kickback/i,
    primaryAnt: [],
    primaryPost: ["gluteal"],
    secAnt: [],
    secPost: ["hamstring"],
  },
  // ── CALVES ──────────────────────────────────────────
  {
    re: /calf.?raise|standing.?calf|seated.?calf|donkey.?calf|\bcalves\b/i,
    primaryAnt: ["calves"],
    primaryPost: ["calves"],
    secAnt: [],
    secPost: [],
  },
  // ── ABS / CORE ──────────────────────────────────────
  {
    re: /plank|side.?plank/i,
    primaryAnt: ["abs", "obliques"],
    primaryPost: [],
    secAnt: [],
    secPost: [],
  },
  {
    re: /crunch|sit.?up|ab.?wheel|cable.?crunch|reverse.?crunch/i,
    primaryAnt: ["abs"],
    primaryPost: [],
    secAnt: ["obliques"],
    secPost: [],
  },
  {
    re: /leg.?raise|hanging.?leg|hanging.?knee|knee.?raise/i,
    primaryAnt: ["abs"],
    primaryPost: [],
    secAnt: ["obliques", "quadriceps"],
    secPost: [],
  },
  {
    re: /russian.?twist|oblique.?crunch|side.?bend|wood.?chop/i,
    primaryAnt: ["obliques"],
    primaryPost: [],
    secAnt: ["abs"],
    secPost: [],
  },
  // ── CARDIO / FULL BODY ──────────────────────────────
  {
    re: /run|jog|sprint|treadmill|cycling|stationary.?bike|elliptical|jump.?rope|stair.?climb/i,
    primaryAnt: ["quadriceps", "calves"],
    primaryPost: ["calves"],
    secAnt: [],
    secPost: ["gluteal", "hamstring"],
  },
  {
    re: /burpee|box.?jump|broad.?jump|jump.?squat/i,
    primaryAnt: ["quadriceps", "abs"],
    primaryPost: ["gluteal"],
    secAnt: [],
    secPost: ["hamstring", "calves"],
  },
];

function localClassify(name: string): MuscleGroups {
  // Try exact regex match
  for (const { re, primaryAnt, primaryPost, secAnt, secPost } of QUICK) {
    if (re.test(name)) return { primaryAnt, primaryPost, secAnt, secPost };
  }
  // Fallback: try individual keywords
  const n = name.toLowerCase();
  if (/chest|bench|pec/.test(n)) return { primaryAnt:["chest"], primaryPost:[], secAnt:["triceps","front-deltoids"], secPost:["triceps"] };
  if (/pull.up|pulldown|lat/.test(n)) return { primaryAnt:[], primaryPost:["upper-back"], secAnt:["biceps"], secPost:["trapezius"] };
  if (/squat|quad/.test(n)) return { primaryAnt:["quadriceps"], primaryPost:[], secAnt:[], secPost:["gluteal"] };
  if (/dead|rdl/.test(n)) return { primaryAnt:[], primaryPost:["hamstring","gluteal"], secAnt:[], secPost:["lower-back"] };
  if (/curl|bicep/.test(n)) return { primaryAnt:["biceps"], primaryPost:[], secAnt:["forearm"], secPost:[] };
  if (/tricep|push.?down|extension/.test(n)) return { primaryAnt:["triceps"], primaryPost:["triceps"], secAnt:[], secPost:[] };
  if (/shoulder|delt|press/.test(n)) return { primaryAnt:["front-deltoids"], primaryPost:[], secAnt:["triceps"], secPost:["trapezius"] };
  if (/row|back/.test(n)) return { primaryAnt:[], primaryPost:["upper-back"], secAnt:["biceps"], secPost:["trapezius"] };
  if (/glute|hip.thrust|bridge/.test(n)) return { primaryAnt:[], primaryPost:["gluteal"], secAnt:[], secPost:["hamstring"] };
  if (/hamstring|leg.curl/.test(n)) return { primaryAnt:[], primaryPost:["hamstring"], secAnt:[], secPost:["gluteal"] };
  if (/calf|calves/.test(n)) return { primaryAnt:["calves"], primaryPost:["calves"], secAnt:[], secPost:[] };
  if (/ab|crunch|plank|core/.test(n)) return { primaryAnt:["abs"], primaryPost:[], secAnt:["obliques"], secPost:[] };
  return { primaryAnt:[], primaryPost:[], secAnt:[], secPost:[] };
}

function buildData(primary: string[], secondary: string[], label: string) {
  const out: object[] = [];
  if (primary.length)   out.push({ name: label,       muscles: primary,   frequency: 2 });
  if (secondary.length) out.push({ name: label + "-s", muscles: secondary, frequency: 1 });
  return out;
}

/* ── Ghost icon ── */
const GHOST = (
  <svg width="15" height="15" viewBox="0 0 64 64" fill="none">
    <path d="M 12 32 A 20 20 0 0 1 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z"
      fill="white" fillOpacity="0.85"/>
    <circle cx="24" cy="29" r="4" fill="#0d0d1a"/>
    <circle cx="40" cy="29" r="4" fill="#0d0d1a"/>
  </svg>
);

/* ── Component ── */
export default function ExerciseDemo({ exerciseName, onClose }: Props) {
  const [tab, setTab]                       = useState<"demo"|"bodyweight"|"weighted">("demo");
  const [info, setInfo]                     = useState<ExerciseInfo | null>(null);
  const [loading, setLoading]               = useState(false);
  const [browseItems, setBrowseItems]       = useState<BrowseItem[]>([]);
  const [browseLoading, setBrowseLoading]   = useState(false);
  const [selected, setSelected]             = useState<string | null>(null);
  const [selInfo, setSelInfo]               = useState<ExerciseInfo | null>(null);
  const [selLoading, setSelLoading]         = useState(false);

  /* Fetch API data for the typed exercise */
  useEffect(() => {
    if (!exerciseName.trim()) return;
    setLoading(true); setInfo(null);
    fetch(`/api/exercise-info?name=${encodeURIComponent(exerciseName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setInfo(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [exerciseName]);

  /* Fetch browse list when tab changes */
  useEffect(() => {
    if (tab !== "bodyweight" && tab !== "weighted") return;
    setBrowseItems([]); setSelected(null); setSelInfo(null);
    setBrowseLoading(true);
    fetch(`/api/exercise-browse?type=${tab}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setBrowseItems(d); setBrowseLoading(false); })
      .catch(() => setBrowseLoading(false));
  }, [tab]);

  /* Fetch detail for a browse item */
  const openBrowse = (name: string) => {
    setSelected(name); setSelInfo(null); setSelLoading(true);
    fetch(`/api/exercise-info?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setSelInfo(d); setSelLoading(false); })
      .catch(() => setSelLoading(false));
  };

  /* Compute muscle groups for demo tab */
  const groups: MuscleGroups = info
    ? fromApi(info.target, info.secondaryMuscles)
    : localClassify(exerciseName);

  const antData  = buildData(groups.primaryAnt,  groups.secAnt,  exerciseName);
  const postData = buildData(groups.primaryPost, groups.secPost, exerciseName);
  const frontFirst = groups.primaryAnt.length >= groups.primaryPost.length;

  /* Muscle groups for a browse selection */
  function browseGroups(ex: ExerciseInfo): MuscleGroups {
    return fromApi(ex.target, ex.secondaryMuscles);
  }

  /* Render a body model card */
  const COLORS = ["#3b82f6", "#f97316"]; // freq1=blue (secondary), freq2=orange (primary)
  const modelCard = (
    type: "anterior" | "posterior",
    data: object[],
    isMain: boolean
  ) => (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.28)" }}>
        {type === "anterior" ? "FRONT" : "BACK"}
      </span>
      <div style={{
        background: "#0b0b1c",
        border: `1px solid ${isMain ? "rgba(249,115,22,0.32)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: isMain ? 20 : 14,
        padding: isMain ? "12px 10px" : "8px 7px",
        boxShadow: isMain ? "0 0 30px rgba(249,115,22,0.08)" : "none",
      }}>
        <Model
          type={type}
          data={data as never[]}
          bodyColor="#111128"
          highlightedColors={COLORS}
          style={{ width: isMain ? 168 : 128 }}
          svgStyle={{ display:"block" }}
        />
      </div>
    </div>
  );

  /* Render front+back pair */
  const modelPair = (g: MuscleGroups, label: string) => {
    const aData = buildData(g.primaryAnt,  g.secAnt,  label);
    const pData = buildData(g.primaryPost, g.secPost, label);
    const ff = g.primaryAnt.length >= g.primaryPost.length;
    return (
      <div className="flex gap-4 justify-center mb-5">
        {ff ? (<>
          {modelCard("anterior",  aData, true)}
          {modelCard("posterior", pData, false)}
        </>) : (<>
          {modelCard("posterior", pData, true)}
          {modelCard("anterior",  aData, false)}
        </>)}
      </div>
    );
  };

  /* Render step-by-step instructions */
  const renderSteps = (instructions: string[]) => instructions.length === 0 ? null : (
    <>
      <p className="text-[10px] font-bold tracking-widest mb-3"
        style={{ color:"rgba(249,115,22,0.6)" }}>HOW TO DO IT</p>
      <div className="flex flex-col gap-2.5">
        {instructions.map((step, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
              style={{ background:"rgba(249,115,22,0.14)", color:"#fb923c", border:"1px solid rgba(249,115,22,0.28)" }}>
              {i + 1}
            </div>
            <p className="text-xs leading-relaxed" style={{ color:"#aaa" }}>{step}</p>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end"
      style={{ background:"rgba(0,0,0,0.88)", backdropFilter:"blur(14px)" }}
      onClick={onClose}>

      <div className="w-full max-w-xl mx-auto rounded-t-3xl flex flex-col"
        style={{
          background:"linear-gradient(180deg,#0d0d1a 0%,#080810 100%)",
          border:"1px solid rgba(167,139,250,0.15)",
          borderBottom:"none",
          height:"90dvh",
          overflowY:"auto",
          paddingBottom:"env(safe-area-inset-bottom,24px)",
        }}
        onClick={e => e.stopPropagation()}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background:"rgba(167,139,250,0.28)" }}/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {GHOST}
            <p className="text-sm font-bold" style={{ color:"#e9d5ff" }}>Exercise Guide</p>
          </div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize:20, color:"#555" }}>close</span>
          </button>
        </div>

        {/* Exercise name */}
        <p className="px-5 pb-3 text-[15px] font-bold capitalize" style={{ color:"#f2f2f2" }}>
          {exerciseName}
        </p>

        {/* Tabs */}
        <div className="flex mx-5 mb-4 p-0.5 rounded-2xl gap-1 shrink-0"
          style={{ background:"rgba(255,255,255,0.04)" }}>
          {(["demo","bodyweight","weighted"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-xl text-xs font-bold border-none cursor-pointer"
              style={{
                background: tab === t ? "rgba(249,115,22,0.18)" : "transparent",
                color: tab === t ? "#fb923c" : "#555",
              }}>
              {t === "demo" ? "How To" : t === "bodyweight" ? "Bodyweight" : "Weighted"}
            </button>
          ))}
        </div>

        {/* ─── HOW TO TAB ─────────────────────────────────── */}
        {tab === "demo" && (
          <div className="px-5 pb-6">
            {/* Legend */}
            <div className="flex justify-center gap-5 mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full"
                  style={{ background:"#f97316", boxShadow:"0 0 8px rgba(249,115,22,0.8)" }}/>
                <span className="text-[10px]" style={{ color:"#666" }}>Primary</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full"
                  style={{ background:"#3b82f6", boxShadow:"0 0 6px rgba(59,130,246,0.7)" }}/>
                <span className="text-[10px]" style={{ color:"#666" }}>Secondary</span>
              </div>
            </div>

            {/* Body diagrams */}
            {modelPair(groups, exerciseName)}

            {/* Loading / instructions */}
            {loading && (
              <div className="flex justify-center py-4"><div className="spinner"/></div>
            )}
            {info && renderSteps(info.instructions)}

            {/* Tags */}
            {info && (
              <div className="flex flex-wrap gap-2 mt-4">
                {info.target && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full capitalize"
                    style={{ background:"rgba(249,115,22,0.12)", color:"#fb923c", border:"1px solid rgba(249,115,22,0.25)" }}>
                    🎯 {info.target}
                  </span>
                )}
                {info.equipment && info.equipment !== "body weight" && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full capitalize"
                    style={{ background:"rgba(255,255,255,0.05)", color:"#555", border:"1px solid rgba(255,255,255,0.08)" }}>
                    {info.equipment}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── BROWSE TABS ────────────────────────────────── */}
        {(tab === "bodyweight" || tab === "weighted") && (
          <div className="px-5 pb-6">
            {/* Back button */}
            {selected && (
              <button onClick={() => { setSelected(null); setSelInfo(null); }}
                className="flex items-center gap-1.5 mb-4 border-none bg-transparent cursor-pointer"
                style={{ color:"#fb923c" }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>arrow_back</span>
                <span className="text-sm font-semibold">Back</span>
              </button>
            )}

            {/* Browse detail view */}
            {selected && selLoading && (
              <div className="flex justify-center py-12"><div className="spinner"/></div>
            )}
            {selected && !selLoading && selInfo && (
              <>
                <p className="text-[15px] font-bold capitalize mb-4" style={{ color:"#f2f2f2" }}>{selected}</p>
                {modelPair(browseGroups(selInfo), selected)}
                {renderSteps(selInfo.instructions)}
                {selInfo.target && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full capitalize"
                      style={{ background:"rgba(249,115,22,0.12)", color:"#fb923c", border:"1px solid rgba(249,115,22,0.25)" }}>
                      🎯 {selInfo.target}
                    </span>
                    {selInfo.equipment && selInfo.equipment !== "body weight" && (
                      <span className="text-[10px] px-2.5 py-1 rounded-full capitalize"
                        style={{ background:"rgba(255,255,255,0.05)", color:"#555", border:"1px solid rgba(255,255,255,0.08)" }}>
                        {selInfo.equipment}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Browse list */}
            {!selected && (
              browseLoading
                ? <div className="flex justify-center py-12"><div className="spinner"/></div>
                : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold tracking-widest mb-2"
                      style={{ color:"rgba(249,115,22,0.5)" }}>
                      {tab === "bodyweight" ? "NO EQUIPMENT NEEDED" : "FULL BODY WEIGHTED"}
                    </p>
                    {browseItems.map(item => (
                      <button key={item.name} onClick={() => openBrowse(item.name)}
                        className="flex items-center gap-3 p-3 rounded-2xl text-left border-none cursor-pointer w-full"
                        style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)" }}>
                        {item.image
                          ? <img src={item.image} alt={item.name}
                              className="rounded-xl object-cover shrink-0"
                              style={{ width:48, height:48, filter:"brightness(0.75) saturate(0.1)" }}/>
                          : <div className="rounded-xl shrink-0 flex items-center justify-center"
                              style={{ width:48, height:48, background:"rgba(249,115,22,0.08)" }}>{GHOST}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold capitalize" style={{ color:"#f2f2f2" }}>{item.name}</p>
                          <p className="text-xs mt-0.5" style={{ color:"#555" }}>
                            {tab === "bodyweight" ? "No equipment" : "Weighted"}
                          </p>
                        </div>
                        <span className="material-symbols-outlined shrink-0"
                          style={{ fontSize:16, color:"#444" }}>chevron_right</span>
                      </button>
                    ))}
                  </div>
                )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
