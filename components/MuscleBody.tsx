"use client";
import React from "react";

/* ── Muscle ID map ── */
const MUSCLE_MAP: Record<string, string[]> = {
  pectorals: ["chest-l","chest-r"], chest: ["chest-l","chest-r"],
  abs: ["abs-upper","abs-lower"], abdominals: ["abs-upper","abs-lower"],
  core: ["abs-upper","abs-lower"], "obliques": ["abs-upper","abs-lower"],
  biceps: ["bicep-l","bicep-r"], "biceps brachii": ["bicep-l","bicep-r"],
  triceps: ["tricep-l","tricep-r"], "triceps brachii": ["tricep-l","tricep-r"],
  quads: ["quad-l","quad-r"], quadriceps: ["quad-l","quad-r"],
  "upper legs": ["quad-l","quad-r","ham-l","ham-r"],
  calves: ["calf-l","calf-r"], "lower legs": ["calf-l","calf-r"],
  lats: ["lat-l","lat-r"], "latissimus dorsi": ["lat-l","lat-r"],
  back: ["lat-l","lat-r","trap"], "upper back": ["trap","lat-l","lat-r"],
  "lower back": ["lat-l","lat-r"],
  traps: ["trap"], trapezius: ["trap"], "levator scapulae": ["trap"],
  shoulders: ["shoulder-l","shoulder-r"], delts: ["shoulder-l","shoulder-r"],
  deltoids: ["shoulder-l","shoulder-r"], "anterior deltoid": ["shoulder-l","shoulder-r"],
  "rear deltoid": ["shoulder-l","shoulder-r"], "middle deltoid": ["shoulder-l","shoulder-r"],
  glutes: ["glute-l","glute-r"], "gluteus maximus": ["glute-l","glute-r"],
  "gluteus medius": ["glute-l","glute-r"], "hip flexors": ["quad-l","quad-r"],
  hamstrings: ["ham-l","ham-r"],
  forearms: ["forearm-l","forearm-r"], "wrist flexors": ["forearm-l","forearm-r"],
  "serratus anterior": ["chest-l","chest-r"],
  "cardiovascular system": ["quad-l","quad-r","calf-l","calf-r"],
  spine: ["lat-l","lat-r"], "erector spinae": ["lat-l","lat-r"],
  adductors: ["quad-l","quad-r"], abductors: ["glute-l","glute-r"],
};

const BACK_IDS = new Set(["lat-l","lat-r","trap","tricep-l","tricep-r","glute-l","glute-r","ham-l","ham-r"]);

function getMuscleIds(target: string, sec: string[]): string[] {
  const all = new Set<string>();
  const check = (n: string) => {
    const t = n.toLowerCase().trim();
    for (const [k, ids] of Object.entries(MUSCLE_MAP)) {
      if (t === k || t.includes(k) || k.includes(t)) ids.forEach(id => all.add(id));
    }
  };
  check(target);
  sec.forEach(check);
  return [...all];
}

/* ── Local name → muscle (no API needed) ── */
const QUICK: Array<{ re: RegExp; target: string; sec: string[] }> = [
  { re: /bench|chest.?press|pec|fly|flye|push.?up|pushup|incline|decline|crossover|cable.?chest/i,   target:"pectorals",  sec:["triceps","shoulders"] },
  { re: /shoulder.?press|overhead|ohp|military|arnold|seated.?press/i,                                target:"shoulders",  sec:["triceps","traps"]     },
  { re: /lateral.?raise|front.?raise|upright.?row|rear.?delt|face.?pull/i,                           target:"shoulders",  sec:["traps"]               },
  { re: /tricep|skull|close.?grip|pushdown|dip|cable.?ext|overhead.?tri/i,                           target:"triceps",    sec:["shoulders"]           },
  { re: /pull.?up|chin.?up|lat.?pull|pull.?down/i,                                                   target:"lats",       sec:["biceps","traps"]      },
  { re: /row|bent.?over|cable.?row|seated.?row|t.?bar/i,                                             target:"lats",       sec:["traps","biceps"]      },
  { re: /shrug|trap/i,                                                                                 target:"traps",      sec:["shoulders"]           },
  { re: /curl|bicep|hammer|preacher|concentration/i,                                                  target:"biceps",     sec:["forearms"]            },
  { re: /squat|goblet|leg.?press|lunge|step.?up|bulgarian|hack.?squat|box.?squat/i,                 target:"quads",      sec:["glutes","hamstrings"] },
  { re: /deadlift|rdl|romanian|sumo|hip.?hinge|good.?morning/i,                                     target:"hamstrings", sec:["glutes","lats"]       },
  { re: /leg.?curl|hamstring|nordic/i,                                                               target:"hamstrings", sec:["glutes"]              },
  { re: /leg.?ext/i,                                                                                  target:"quads",      sec:[]                      },
  { re: /calf.?raise|calves|standing.?calf|seated.?calf/i,                                          target:"calves",     sec:[]                      },
  { re: /glute|hip.?thrust|bridge|donkey.?kick|hip.?ext|kickback/i,                                 target:"glutes",     sec:["hamstrings"]          },
  { re: /plank|crunch|ab|sit.?up|core|oblique|leg.?raise|hanging|russian/i,                         target:"abs",        sec:[]                      },
  { re: /wrist|reverse.?curl|forearm/i,                                                              target:"forearms",   sec:[]                      },
  { re: /run|jog|treadmill|cycling|bike|cardio|elliptical|jump.?rope|burpee/i,                      target:"quads",      sec:["calves","glutes"]     },
  { re: /box.?jump|broad.?jump|jump.?squat/i,                                                        target:"quads",      sec:["glutes","calves"]     },
];

export function classifyExercise(name: string): { target: string; secondary: string[] } {
  for (const { re, target, sec } of QUICK) {
    if (re.test(name)) return { target, secondary: sec };
  }
  return { target: "", secondary: [] };
}

const DISPLAY_NAMES: Record<string, string> = {
  pectorals:"Chest", chest:"Chest", abs:"Abs", core:"Abs",
  biceps:"Biceps", triceps:"Triceps", quads:"Quads", quadriceps:"Quads",
  calves:"Calves", lats:"Lats", traps:"Traps", trapezius:"Traps",
  shoulders:"Shoulders", delts:"Shoulders", deltoids:"Shoulders",
  glutes:"Glutes", hamstrings:"Hamstrings", forearms:"Forearms",
  "upper legs":"Legs", back:"Back", "lower back":"Lower Back",
  "upper back":"Upper Back",
};

interface Props { target: string; secondaryMuscles: string[]; exerciseName?: string; }

export default function MuscleBody({ target, secondaryMuscles, exerciseName }: Props) {
  const local      = exerciseName ? classifyExercise(exerciseName) : { target:"", secondary:[] };
  const effTarget  = target || local.target;
  const effSec     = secondaryMuscles.length ? secondaryMuscles : local.secondary;

  const primaryIds   = getMuscleIds(effTarget, []);
  const secondaryIds = getMuscleIds("", effSec).filter(id => !primaryIds.includes(id));

  const backCount  = primaryIds.filter(id => BACK_IDS.has(id)).length;
  const frontFirst = primaryIds.length === 0 || (primaryIds.length - backCount) >= backCount;
  const views: Array<"front"|"back"> = frontFirst ? ["front","back"] : ["back","front"];

  const label = DISPLAY_NAMES[effTarget.toLowerCase()] || (effTarget ? effTarget.replace(/\b\w/g, c => c.toUpperCase()) : "");
  const secLabel = effSec.slice(0,2).map(s => DISPLAY_NAMES[s.toLowerCase()] || s.replace(/\b\w/g, c => c.toUpperCase())).join(", ");

  /* ── colour helpers ── */
  const fill   = (id: string) => primaryIds.includes(id) ? "rgba(249,115,22,0.92)" : secondaryIds.includes(id) ? "rgba(59,130,246,0.75)" : "rgba(255,255,255,0.11)";
  const stroke = (id: string) => primaryIds.includes(id) ? "rgba(253,186,116,1)"   : secondaryIds.includes(id) ? "rgba(147,197,253,0.85)" : "rgba(255,255,255,0.09)";
  const sw     = (id: string) => primaryIds.includes(id) ? 1.8 : secondaryIds.includes(id) ? 1.2 : 0.4;
  const filt   = (id: string) => primaryIds.includes(id) ? "url(#gp)" : secondaryIds.includes(id) ? "url(#gs)" : undefined;

  const E = (id: string, cx: number, cy: number, rx: number, ry: number, rot?: number) => (
    <ellipse key={id} cx={cx} cy={cy} rx={rx} ry={ry}
      fill={fill(id)} stroke={stroke(id)} strokeWidth={sw(id)} filter={filt(id)}
      transform={rot !== undefined ? `rotate(${rot},${cx},${cy})` : undefined}/>
  );
  const Rect = (id: string, x: number, y: number, w: number, h: number, r = 4) => (
    <rect key={id} x={x} y={y} width={w} height={h} rx={r}
      fill={fill(id)} stroke={stroke(id)} strokeWidth={sw(id)} filter={filt(id)}/>
  );

  /* body silhouette — simple shapes, reliable rendering */
  const silhouette = (view: "front"|"back") => {
    const c = "rgba(200,210,230,0.09)";
    const s = "rgba(255,255,255,0.14)";
    const sw_ = 0.7;
    return (<>
      {/* head */}
      <ellipse cx="50" cy="16" rx="14" ry="15" fill={c} stroke={s} strokeWidth={sw_}/>
      <circle cx="44" cy="14" r="2.4" fill="#060614"/>
      <circle cx="56" cy="14" r="2.4" fill="#060614"/>
      <circle cx="44" cy="14" r="1.1" fill="rgba(196,181,253,0.9)"/>
      <circle cx="56" cy="14" r="1.1" fill="rgba(196,181,253,0.9)"/>
      {/* neck */}
      <rect x="45" y="30" width="10" height="12" rx="4" fill={c} stroke={s} strokeWidth={sw_}/>
      {/* shoulders */}
      <ellipse cx="22" cy="44" rx="14" ry="9" fill={c} stroke={s} strokeWidth={sw_}/>
      <ellipse cx="78" cy="44" rx="14" ry="9" fill={c} stroke={s} strokeWidth={sw_}/>
      {/* upper arms */}
      <ellipse cx="11" cy="74" rx="7" ry="28" fill={c} stroke={s} strokeWidth={sw_} transform="rotate(-4,11,74)"/>
      <ellipse cx="89" cy="74" rx="7" ry="28" fill={c} stroke={s} strokeWidth={sw_} transform="rotate(4,89,74)"/>
      {/* forearms */}
      <ellipse cx="9"  cy="115" rx="6" ry="24" fill={c} stroke={s} strokeWidth={sw_}/>
      <ellipse cx="91" cy="115" rx="6" ry="24" fill={c} stroke={s} strokeWidth={sw_}/>
      {/* torso */}
      <rect x="27" y="40" width="46" height="112" rx="8" fill={c} stroke={s} strokeWidth={sw_}/>
      {/* thighs */}
      <ellipse cx="36" cy="192" rx="13" ry="42" fill={c} stroke={s} strokeWidth={sw_}/>
      <ellipse cx="64" cy="192" rx="13" ry="42" fill={c} stroke={s} strokeWidth={sw_}/>
      {/* knees */}
      <ellipse cx="36" cy="238" rx="10" ry="8" fill="rgba(200,210,230,0.06)" stroke={s} strokeWidth="0.4"/>
      <ellipse cx="64" cy="238" rx="10" ry="8" fill="rgba(200,210,230,0.06)" stroke={s} strokeWidth="0.4"/>
      {/* calves */}
      <ellipse cx="35" cy="260" rx="9" ry="22" fill={c} stroke={s} strokeWidth={sw_}/>
      <ellipse cx="65" cy="260" rx="9" ry="22" fill={c} stroke={s} strokeWidth={sw_}/>
    </>);
  };

  const muscles = (view: "front"|"back") => view === "front" ? (<>
    {E("shoulder-l",  22, 44, 12,  8)}
    {E("shoulder-r",  78, 44, 12,  8)}
    {E("chest-l",     37, 66, 13, 17)}
    {E("chest-r",     63, 66, 13, 17)}
    {E("bicep-l",     11, 70,  6, 21, -4)}
    {E("bicep-r",     89, 70,  6, 21,  4)}
    {E("forearm-l",    9,113,  5, 18)}
    {E("forearm-r",   91,113,  5, 18)}
    {Rect("abs-upper", 38, 88, 24, 13, 5)}
    {Rect("abs-lower", 38,103, 24, 13, 5)}
    {E("quad-l",      36,191, 12, 38)}
    {E("quad-r",      64,191, 12, 38)}
    {E("calf-l",      35,260,  8, 19)}
    {E("calf-r",      65,260,  8, 19)}
  </>) : (<>
    {E("trap",        50, 44, 18,  9)}
    {E("shoulder-l",  22, 49, 12,  9)}
    {E("shoulder-r",  78, 49, 12,  9)}
    {E("lat-l",       30, 88, 12, 26)}
    {E("lat-r",       70, 88, 12, 26)}
    {E("tricep-l",    11, 72,  6, 22, -4)}
    {E("tricep-r",    89, 72,  6, 22,  4)}
    {E("forearm-l",    9,113,  5, 18)}
    {E("forearm-r",   91,113,  5, 18)}
    {E("glute-l",     37,150, 13, 15)}
    {E("glute-r",     63,150, 13, 15)}
    {E("ham-l",       36,197, 12, 38)}
    {E("ham-r",       64,197, 12, 38)}
    {E("calf-l",      35,258,  8, 20)}
    {E("calf-r",      65,258,  8, 20)}
  </>);

  return (
    <div style={{ marginBottom: 16 }}>

      {/* label */}
      {label && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#f97316", boxShadow:"0 0 10px rgba(249,115,22,0.9)" }}/>
          <span style={{ fontSize:14, fontWeight:700, color:"#f97316" }}>{label}</span>
          {secLabel && <span style={{ fontSize:11, color:"#555" }}>+ {secLabel}</span>}
        </div>
      )}

      {/* views */}
      <div style={{ display:"flex", gap:10, justifyContent:"center", alignItems:"flex-start" }}>
        {views.map((view, vi) => {
          const isMain = vi === 0;
          const W = isMain ? 150 : 108;
          const H = isMain ? 420 : 302;
          return (
            <div key={view} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.25)" }}>
                {view.toUpperCase()}
              </span>
              <div style={{
                background:"linear-gradient(160deg,#0c0c20 0%,#060612 100%)",
                border:`1px solid ${isMain ? "rgba(249,115,22,0.30)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: isMain ? 20 : 14,
                padding: isMain ? "14px 12px" : "10px 8px",
                boxShadow: isMain
                  ? "0 0 0 1px rgba(249,115,22,0.05), 0 8px 40px rgba(0,0,0,0.65)"
                  : "0 4px 20px rgba(0,0,0,0.5)",
              }}>
                <svg viewBox="0 0 100 280" width={W} height={H}
                  style={{ overflow:"visible", display:"block" }}>
                  <defs>
                    <filter id="gp" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
                      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                    <filter id="gs" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
                      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  {silhouette(view)}
                  {muscles(view)}
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:20, marginTop:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:"#f97316", boxShadow:"0 0 10px rgba(249,115,22,0.9)" }}/>
          <span style={{ fontSize:10, color:"#666" }}>Primary</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:"#3b82f6", boxShadow:"0 0 6px rgba(59,130,246,0.7)" }}/>
          <span style={{ fontSize:10, color:"#666" }}>Secondary</span>
        </div>
      </div>
    </div>
  );
}
