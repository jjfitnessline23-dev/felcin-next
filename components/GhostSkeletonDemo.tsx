"use client";
import React from "react";

function classify(name: string): string {
  const n = name.toLowerCase();
  if (/squat|leg.?press|goblet|wall.?sit|lunge|step.?up|bulgarian/.test(n)) return "squat";
  if (/deadlift|rdl|romanian|hip.?hinge|good.?morning|sumo/.test(n))        return "dead";
  if (/run|jog|sprint|treadmill|cycling|bike|elliptical|cardio|walk/.test(n)) return "run";
  if (/bench|chest.?press|push.?up|pushup|incline|decline|fly|flye/.test(n)) return "bench";
  if (/pull.?up|chin.?up|lat.?pull|pull.?down/.test(n))                      return "spress";
  if (/row|seated.?row|bent.?over|cable.?row/.test(n))                       return "dead";
  if (/shoulder.?press|overhead|military.?press|ohp|arnold/.test(n))         return "spress";
  if (/lateral.?raise|front.?raise|upright.?row/.test(n))                    return "spress";
  if (/curl|bicep|hammer|preacher/.test(n))                                  return "curl";
  if (/tricep|skull|close.?grip|overhead.?tri|pushdown/.test(n))             return "curl";
  if (/dip/.test(n))                                                          return "bench";
  if (/jump|burpee|jack/.test(n))                                            return "squat";
  if (/plank|hold|isometric|ab |crunch|sit.?up/.test(n))                     return "gen";
  return "gen";
}

export default function GhostSkeletonDemo({ exerciseName }: { exerciseName: string }) {
  const type = classify(exerciseName);
  const dur  = type === "run" ? "0.7s" : "2.2s";
  const ease = type === "run" ? "linear" : "ease-in-out";

  const anim = (part: string): React.CSSProperties => ({
    transformBox: "fill-box",
    transformOrigin: "50% 0%",
    animation: `skel-${type}-${part} ${dur} ${ease} infinite`,
  });

  const W = "rgba(255,255,255,0.93)";
  const J = "#c4b5fd";
  const EYE = "#080814";

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
      <svg viewBox="0 0 200 330" width="162" height="268"
        style={{ overflow: "visible", filter: "drop-shadow(0 0 14px rgba(109,40,217,0.55))" }}>
        <defs>
          <filter id="jg"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Whole body — translates for squat / bounce */}
        <g style={{ animation: `skel-${type}-body ${dur} ${ease} infinite` }}>

          {/* Ghost head */}
          <ellipse cx="100" cy="46" rx="30" ry="30" fill={W}/>
          <circle cx="89" cy="43" r="6" fill={EYE}/>
          <circle cx="111" cy="43" r="6" fill={EYE}/>
          <circle cx="91" cy="41" r="2.8" fill={W} opacity="0.9"/>
          <circle cx="113" cy="41" r="2.8" fill={W} opacity="0.9"/>
          <ellipse cx="100" cy="46" rx="30" ry="30" fill="none" stroke="rgba(196,181,253,0.28)" strokeWidth="1.5"/>

          {/* Neck */}
          <rect x="96" y="74" width="8" height="14" rx="4" fill={W}/>

          {/* Torso */}
          <rect x="88" y="87" width="24" height="104" rx="7" fill={W}/>

          {/* Shoulder bar */}
          <rect x="56" y="94" width="88" height="7" rx="3.5" fill={W}/>

          {/* Hip bar */}
          <rect x="74" y="186" width="52" height="7" rx="3.5" fill={W}/>

          {/* ── LEFT ARM: shoulder at (60, 98) ── */}
          <g transform="translate(60,98)">
            <g style={anim("lua")}>
              <rect x="-4" y="0" width="8" height="46" rx="4" fill={W}/>
              <circle cx="0" cy="46" r="5" fill={J} filter="url(#jg)"/>
              <g transform="translate(0,46)">
                <g style={anim("lfa")}>
                  <rect x="-3.5" y="0" width="7" height="40" rx="3.5" fill={W}/>
                </g>
              </g>
            </g>
          </g>
          <circle cx="60" cy="98" r="6.5" fill={J} filter="url(#jg)"/>

          {/* ── RIGHT ARM: shoulder at (140, 98) ── */}
          <g transform="translate(140,98)">
            <g style={anim("rua")}>
              <rect x="-4" y="0" width="8" height="46" rx="4" fill={W}/>
              <circle cx="0" cy="46" r="5" fill={J} filter="url(#jg)"/>
              <g transform="translate(0,46)">
                <g style={anim("rfa")}>
                  <rect x="-3.5" y="0" width="7" height="40" rx="3.5" fill={W}/>
                </g>
              </g>
            </g>
          </g>
          <circle cx="140" cy="98" r="6.5" fill={J} filter="url(#jg)"/>

          {/* ── LEFT LEG: hip at (83, 190) ── */}
          <g transform="translate(83,190)">
            <g style={anim("lth")}>
              <rect x="-5" y="0" width="10" height="60" rx="5" fill={W}/>
              <circle cx="0" cy="60" r="6" fill={J} filter="url(#jg)"/>
              <g transform="translate(0,60)">
                <g style={anim("lsh")}>
                  <rect x="-4" y="0" width="8" height="56" rx="4" fill={W}/>
                  <rect x="-4" y="52" width="18" height="6" rx="3" fill={W}/>
                </g>
              </g>
            </g>
          </g>
          <circle cx="83" cy="190" r="7" fill={J} filter="url(#jg)"/>

          {/* ── RIGHT LEG: hip at (117, 190) ── */}
          <g transform="translate(117,190)">
            <g style={anim("rth")}>
              <rect x="-5" y="0" width="10" height="60" rx="5" fill={W}/>
              <circle cx="0" cy="60" r="6" fill={J} filter="url(#jg)"/>
              <g transform="translate(0,60)">
                <g style={anim("rsh")}>
                  <rect x="-4" y="0" width="8" height="56" rx="4" fill={W}/>
                  <rect x="-14" y="52" width="18" height="6" rx="3" fill={W}/>
                </g>
              </g>
            </g>
          </g>
          <circle cx="117" cy="190" r="7" fill={J} filter="url(#jg)"/>

        </g>
      </svg>
    </div>
  );
}
