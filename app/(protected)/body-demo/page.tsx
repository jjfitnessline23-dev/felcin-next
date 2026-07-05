"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import PageHeader from "@/components/PageHeader";

const Model = dynamic(() => import("react-body-highlighter").then(m => m.default), { ssr: false });

const EXERCISES: Array<{ label: string; muscles: string[]; posteriorMuscles: string[] }> = [
  {
    label: "Bench Press",
    muscles: ["chest", "triceps", "front-deltoids"],
    posteriorMuscles: [],
  },
  {
    label: "Squat",
    muscles: ["quadriceps", "abductor"],
    posteriorMuscles: ["gluteal", "hamstring", "lower-back"],
  },
  {
    label: "Deadlift",
    muscles: ["abs"],
    posteriorMuscles: ["hamstring", "gluteal", "lower-back", "trapezius", "upper-back"],
  },
  {
    label: "Pull Up",
    muscles: ["biceps"],
    posteriorMuscles: ["upper-back", "lower-back", "trapezius", "back-deltoids"],
  },
  {
    label: "Bicep Curl",
    muscles: ["biceps", "forearm"],
    posteriorMuscles: [],
  },
  {
    label: "Shoulder Press",
    muscles: ["front-deltoids", "triceps"],
    posteriorMuscles: ["trapezius", "back-deltoids"],
  },
];

export default function BodyDemoPage() {
  const [selected, setSelected] = useState(0);
  const ex = EXERCISES[selected];

  const anteriorData = ex.muscles.length
    ? [{ name: ex.label, muscles: ex.muscles as never[] }]
    : [];
  const posteriorData = ex.posteriorMuscles.length
    ? [{ name: ex.label, muscles: ex.posteriorMuscles as never[] }]
    : [];

  return (
    <div className="max-w-xl mx-auto pb-24">
      <PageHeader title="Body Demo" />

      {/* exercise picker */}
      <div className="px-4 pt-4">
        <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>PICK AN EXERCISE</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {EXERCISES.map((e, i) => (
            <button key={e.label} onClick={() => setSelected(i)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
              style={{
                background: selected === i ? "#f97316" : "rgba(255,255,255,0.07)",
                color: selected === i ? "#fff" : "#888",
              }}>
              {e.label}
            </button>
          ))}
        </div>

        {/* exercise name */}
        <p className="text-lg font-bold mb-5 text-center" style={{ color: "#f2f2f2" }}>{ex.label}</p>

        {/* body models */}
        <div className="flex gap-4 justify-center">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold tracking-widest" style={{ color: "#555" }}>FRONT</span>
            <div style={{ background: "#0d0d1a", borderRadius: 16, padding: "12px 10px", border: "1px solid rgba(249,115,22,0.25)" }}>
              <Model
                type="anterior"
                data={anteriorData}
                bodyColor="#1a1a2e"
                highlightedColors={["#f97316"]}
                svgStyle={{ width: 140, height: "auto" }}
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold tracking-widest" style={{ color: "#555" }}>BACK</span>
            <div style={{ background: "#0d0d1a", borderRadius: 16, padding: "12px 10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <Model
                type="posterior"
                data={posteriorData}
                bodyColor="#1a1a2e"
                highlightedColors={["#f97316"]}
                svgStyle={{ width: 140, height: "auto" }}
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-center mt-5" style={{ color: "#555" }}>
          This is react-body-highlighter — free, no license needed
        </p>
      </div>
    </div>
  );
}
