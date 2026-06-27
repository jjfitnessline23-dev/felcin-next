"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface TrainerProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  specialty?: string[];
  ratePerSession?: number;
  sessionCount?: number;
}

const SPECIALTIES = ["All", "Strength", "Cardio", "HIIT", "Yoga", "Bodybuilding", "Weight Loss", "Mobility"];

export default function TrainersPage() {
  const router = useRouter();
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    getDocs(query(collection(db, "trainerProfiles"), where("isActive", "==", true), orderBy("sessionCount", "desc"), limit(50)))
      .then((snap) => {
        setTrainers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<TrainerProfile, "uid">) })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = filter === "All"
    ? trainers
    : trainers.filter((t) => (t.specialty || []).includes(filter));

  return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Find a Trainer" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#020f12 0%,#041a1f 50%,#020f12 100%)", border: "1px solid rgba(6,182,212,0.2)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(6,182,212,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(6,182,212,0.28) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(160deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#06b6d4", fontVariationSettings: "'FILL' 1" }}>sports_martial_arts</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#06b6d4", letterSpacing: "0.18em" }}>TRAINER NETWORK</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#67e8f9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Find a Trainer</h1>
          <p className="text-sm" style={{ color: "#555" }}>Connect with elite fitness coaches in your niche</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#06b6d4" }}>{trainers.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>coaches</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#06b6d4" }}>{SPECIALTIES.length - 1}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>specialties</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Specialty filter */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-2 no-scrollbar">
        {SPECIALTIES.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
            style={{ background: filter === s ? "#f2f2f2" : "rgba(255,255,255,0.07)", color: filter === s ? "#000" : "#888" }}>
            {s}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#333" }}>fitness_center</span>
            <p className="text-sm" style={{ color: "#555" }}>No trainers found{filter !== "All" ? ` for ${filter}` : ""}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((t) => (
              <button key={t.uid} onClick={() => router.push(`/trainers/${t.uid}`)}
                className="w-full text-left p-4 rounded-2xl border-none cursor-pointer"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-3 mb-3">
                  {t.photoURL ? (
                    <img src={t.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 52, height: 52 }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                      style={{ width: 52, height: 52, background: "#222", color: "#888" }}>
                      {(t.displayName || "T").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>{t.displayName}</p>
                    {t.bio && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "#666" }}>{t.bio}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>
                      {t.ratePerSession ? `$${(t.ratePerSession / 100).toFixed(0)}` : "—"}
                    </p>
                    <p className="text-[10px]" style={{ color: "#555" }}>per session</p>
                  </div>
                </div>
                {(t.specialty || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(t.specialty || []).map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                        {s}
                      </span>
                    ))}
                    {t.sessionCount ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold ml-auto"
                        style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                        {t.sessionCount} sessions
                      </span>
                    ) : null}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
