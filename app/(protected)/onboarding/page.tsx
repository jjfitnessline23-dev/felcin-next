"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

const INTERESTS = [
  { id: "strength", icon: "fitness_center", label: "Strength" },
  { id: "cardio", icon: "directions_run", label: "Cardio" },
  { id: "yoga", icon: "self_improvement", label: "Yoga" },
  { id: "hiit", icon: "bolt", label: "HIIT" },
  { id: "cycling", icon: "directions_bike", label: "Cycling" },
  { id: "boxing", icon: "sports_mma", label: "Boxing" },
  { id: "swimming", icon: "pool", label: "Swimming" },
  { id: "calisthenics", icon: "accessibility_new", label: "Calisthenics" },
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid, "settings", "onboarding"), {
        completed: true,
        interests: [...selected],
        completedAt: serverTimestamp(),
      });
    } catch {}
    router.replace("/ghost");
  };

  const skip = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid, "settings", "onboarding"), {
        completed: true,
        interests: [],
        completedAt: serverTimestamp(),
      });
    } catch {}
    router.replace("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ background: "#090909" }}>
      <div className="w-full max-w-sm">

        {step === 0 && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background: "#1c1c1c" }}>
              <img src="/static/logo-nav.svg" alt="Felcin" width={44} height={44} />
            </div>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#f2f2f2" }}>Welcome to Felcin</h1>
            <p className="text-base leading-relaxed mb-8" style={{ color: "#666" }}>
              The fitness platform where you train alongside real people — live or on-demand.
            </p>

            <div className="flex flex-col gap-3 mb-6">
              {[
                { icon: "sprint", text: "Ghost Workouts — train alongside recorded sessions" },
                { icon: "live_tv", text: "Live streams — join real-time fitness classes" },
                { icon: "payments", text: "Support creators directly — no middleman" },
              ].map((f) => (
                <div key={f.icon} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left" style={{ background: "#141414" }}>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "#a78bfa" }}>{f.icon}</span>
                  <span className="text-sm" style={{ color: "#aaa" }}>{f.text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "#fff", color: "#000" }}>
              Get Started
            </button>
            <button onClick={skip} className="w-full mt-3 py-2 text-sm border-none bg-transparent cursor-pointer" style={{ color: "#444" }}>
              Skip setup
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: "#f2f2f2" }}>What do you train?</h2>
              <p className="text-sm" style={{ color: "#555" }}>Pick as many as you like — we'll personalise your feed.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-8">
              {INTERESTS.map((interest) => {
                const on = selected.has(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggle(interest.id)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm border-none cursor-pointer transition-all"
                    style={{
                      background: on ? "rgba(167,139,250,0.15)" : "#141414",
                      color: on ? "#a78bfa" : "#666",
                      border: `1px solid ${on ? "rgba(167,139,250,0.4)" : "transparent"}`,
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: on ? "'FILL' 1" : "'FILL' 0" }}>{interest.icon}</span>
                    {interest.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={finish}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: selected.size > 0 ? "#fff" : "rgba(255,255,255,0.1)", color: selected.size > 0 ? "#000" : "#444" }}>
              {saving ? "Setting up…" : selected.size > 0 ? "Start training →" : "Skip for now"}
            </button>
          </div>
        )}

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-full transition-all" style={{
              width: i === step ? 20 : 6,
              height: 6,
              background: i === step ? "#fff" : "rgba(255,255,255,0.15)",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
