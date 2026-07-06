"use client";

import { useState } from "react";
import FelcinLogo from "@/components/FelcinLogo";
import { useRouter } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { deriveNameFromEmail } from "@/lib/nameUtils";
import { trackSignUp } from "@/lib/gtag";

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
  const [saveError, setSaveError] = useState(false);
  const [dob, setDob] = useState("");
  const [ageBlocked, setAgeBlocked] = useState(false);

  const checkAge = () => {
    if (!dob) return;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 17) {
      setAgeBlocked(true);
    } else {
      setStep(1);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveAndGo = async (interests: string[], destination: string) => {
    if (!user) return;
    setSaving(true);
    setSaveError(false);
    const userProfile = {
      displayName: user.displayName || deriveNameFromEmail(user.email || ""),
      photoURL: user.photoURL || "",
      email: user.email || "",
      createdAt: serverTimestamp(),
    };
    try {
      await Promise.all([
        setDoc(doc(db, "users", user.uid), userProfile, { merge: true }),
        setDoc(doc(db, "users", user.uid, "public", "profile"), userProfile, { merge: true }),
        setDoc(doc(db, "users", user.uid, "settings", "onboarding"), {
          completed: true, interests, completedAt: serverTimestamp(),
        }),
      ]);
      trackSignUp();
      router.replace(destination);
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  const finish = () => saveAndGo([...selected], "/");
  const skip = () => saveAndGo([], "/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ background: "#090909" }}>
      <div className="w-full max-w-sm">

        {step === 0 && !ageBlocked && (
          <div className="text-center">
            <div className="flex justify-center mx-auto mb-6">
              <FelcinLogo size={64} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#f2f2f2" }}>What&apos;s your date of birth?</h1>
            <p className="text-sm mb-8" style={{ color: "#555" }}>You must be 17 or older to use Felcin.</p>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3.5 rounded-2xl text-sm mb-4 border-none outline-none"
              style={{ background: "#141414", color: "#f2f2f2", colorScheme: "dark" }}
            />
            <button
              onClick={checkAge}
              disabled={!dob}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: dob ? "#fff" : "rgba(255,255,255,0.1)", color: dob ? "#000" : "#444" }}>
              Continue
            </button>
          </div>
        )}

        {ageBlocked && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(239,68,68,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#ef4444" }}>block</span>
            </div>
            <h2 className="text-xl font-bold mb-3" style={{ color: "#f2f2f2" }}>You must be 17 or older</h2>
            <p className="text-sm mb-8" style={{ color: "#555" }}>
              Felcin is only available to users aged 17 and above.
            </p>
            <button
              onClick={() => signOut(auth).catch(() => {})}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", color: "#888" }}>
              Sign out
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="text-center">
            <div className="flex justify-center mx-auto mb-6">
              <FelcinLogo size={80} />
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
              onClick={() => setStep(2)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "#fff", color: "#000" }}>
              Get Started
            </button>
            <button onClick={skip} className="w-full mt-3 py-2 text-sm border-none bg-transparent cursor-pointer" style={{ color: "#444" }}>
              Skip setup
            </button>
          </div>
        )}

        {step === 2 && !ageBlocked && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
            </div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#f2f2f2" }}>Meet Ghost Workouts</h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#666" }}>
              Ghost Workouts let you train alongside a recorded session — like having a real workout partner, anytime. You see their reps, sets, and pace in real time as you follow along.
            </p>
            <div className="flex flex-col gap-2 mb-8 text-left">
              {[
                { icon: "play_circle", text: "Watch a creator's recorded workout" },
                { icon: "favorite", text: "Follow their pace and feel the energy" },
                { icon: "upload", text: "Record your own and build an audience" },
              ].map((f) => (
                <div key={f.icon} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#141414" }}>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  <span className="text-sm" style={{ color: "#aaa" }}>{f.text}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(3)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "#fff", color: "#000" }}>
              Got it →
            </button>
            <button onClick={skip} className="w-full mt-3 py-2 text-sm border-none bg-transparent cursor-pointer" style={{ color: "#444" }}>
              Skip setup
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>explore</span>
            </div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#f2f2f2" }}>Finding your way around</h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#666" }}>
              Everything is a tap away. Here&apos;s what&apos;s waiting for you.
            </p>

            <div className="flex flex-col gap-2 mb-8 text-left">
              {[
                { icon: "home", color: "#f2f2f2", label: "Home", desc: "Your feed — posts, workouts & updates from people you follow" },
                { icon: "explore", color: "#06b6d4", label: "Explore", desc: "Discover new creators, trending workouts, and challenges" },
                { icon: "live_tv", color: "#ef4444", label: "Live Studio", desc: "Join live fitness classes or stream your own in real time" },
                { icon: "compare", color: "#a78bfa", label: "Progress Photos", desc: "Upload before & after photos — drag the slider to compare" },
                { icon: "link", color: "#f59e0b", label: "Challenges", desc: "Compete in fitness challenge chains with the community" },
                { icon: "add_circle", color: "#fff", label: "Create (+)", desc: "Share a post, upload a Ghost Workout, or go live" },
              ].map((f) => (
                <div key={f.icon} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#141414" }}>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: f.color, fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{f.label}</p>
                    <p className="text-xs leading-snug mt-0.5" style={{ color: "#555" }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setStep(4)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "#fff", color: "#000" }}>
              Got it →
            </button>
            <button onClick={skip} className="w-full mt-3 py-2 text-sm border-none bg-transparent cursor-pointer" style={{ color: "#444" }}>
              Skip setup
            </button>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: "#f2f2f2" }}>What do you train?</h2>
              <p className="text-sm" style={{ color: "#555" }}>Pick as many as you like — we&apos;ll personalise your feed.</p>
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

            {saveError && (
              <p className="text-xs text-center mb-3" style={{ color: "#f87171" }}>
                Connection error — check your internet and try again.
              </p>
            )}
            <button
              onClick={finish}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: selected.size > 0 ? "#fff" : "rgba(255,255,255,0.1)", color: selected.size > 0 ? "#000" : "#444" }}>
              {saving ? "Setting up…" : saveError ? "Retry →" : selected.size > 0 ? "Start training →" : "Skip for now"}
            </button>
          </div>
        )}

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          {[0, 1, 2, 3, 4].map((i) => (
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
