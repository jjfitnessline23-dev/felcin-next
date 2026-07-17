"use client";

import { useState, useEffect } from "react";
import {
  collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, where, increment,
} from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface Will {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  message: string;
  milestone: "workouts" | "streak";
  milestoneValue: number;
  createdAt?: { seconds: number };
  recipientCount: number;
}

interface WorkoutLog { id: string; date?: { seconds: number }; }

function computeStreak(logs: WorkoutLog[], nowMs: number): number {
  const days = new Set<number>();
  for (const l of logs) {
    if (!l.date) continue;
    days.add(Math.floor(l.date.seconds * 1000 / 86400000));
  }
  const today = Math.floor(nowMs / 86400000);
  let streak = 0;
  for (let d = today; days.has(d); d--) streak++;
  return streak;
}

const WILL_UNLOCK_KEY = (id: string) => `will_unlocked_${id}`;

export default function WillPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"feed" | "create" | "community">("feed");
  const [loading, setLoading] = useState(true);
  const [followingWills, setFollowingWills] = useState<Will[]>([]);
  const [communityWills, setCommunityWills] = useState<Will[]>([]);
  const [myWorkoutCount, setMyWorkoutCount] = useState(0);
  const [myStreak, setMyStreak] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form
  const [message, setMessage] = useState("");
  const [milestone, setMilestone] = useState<"workouts" | "streak">("workouts");
  const [milestoneValue, setMilestoneValue] = useState("50");

  useEffect(() => {
    if (!user) return;
    const nowMs = Date.now();

    async function load() {
      try {
        // My stats
        const logsSnap = await getDocs(
          query(collection(db, "users", user!.uid, "workoutLogs"), orderBy("date", "desc"), limit(100))
        );
        const logs = logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) }));
        setMyWorkoutCount(logs.length);
        setMyStreak(computeStreak(logs, nowMs));

        // Following list
        const followSnap = await getDocs(collection(db, "users", user!.uid, "following"));
        const followingIds = followSnap.docs.map((d) => d.id);

        // Wills from followed users (batch in chunks of 30 for `in` query)
        const wills: Will[] = [];
        if (followingIds.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < followingIds.length; i += 30) chunks.push(followingIds.slice(i, i + 30));
          for (const chunk of chunks) {
            const snap = await getDocs(
              query(collection(db, "wills"), where("authorId", "in", chunk), orderBy("createdAt", "desc"), limit(20))
            );
            snap.docs.forEach((d) => wills.push({ id: d.id, ...(d.data() as Omit<Will, "id">) }));
          }
        }
        setFollowingWills(wills);

        // Community — most unlocked
        const commSnap = await getDocs(
          query(collection(db, "wills"), orderBy("recipientCount", "desc"), limit(20))
        );
        setCommunityWills(commSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Will, "id">) })));
      } catch {}
      setLoading(false);
    }
    load();
  }, [user]);

  function checkUnlocked(will: Will): boolean {
    if (will.milestone === "workouts") return myWorkoutCount >= will.milestoneValue;
    if (will.milestone === "streak") return myStreak >= will.milestoneValue;
    return false;
  }

  async function handleReveal(will: Will) {
    const key = WILL_UNLOCK_KEY(will.id);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    try {
      await updateDoc(doc(db, "wills", will.id), { recipientCount: increment(1) });
    } catch {}
  }

  async function handleCreate() {
    if (!user || !message.trim() || saving) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "wills"), {
        authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        ...(user.photoURL ? { authorPhoto: user.photoURL } : {}),
        message: message.trim(),
        milestone,
        milestoneValue: Number(milestoneValue) || 50,
        createdAt: serverTimestamp(),
        recipientCount: 0,
      });
      setCommunityWills((p) => [{
        id: ref.id, authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        message: message.trim(), milestone, milestoneValue: Number(milestoneValue) || 50,
        recipientCount: 0,
      }, ...p]);
      setMessage(""); setMilestoneValue("50"); setTab("community");
    } catch {}
    setSaving(false);
  }

  function milestoneLabel(will: Will): string {
    if (will.milestone === "workouts") return `${will.milestoneValue} workouts`;
    return `${will.milestoneValue}-day streak`;
  }

  function WillCard({ will, showProgress }: { will: Will; showProgress?: boolean }) {
    const unlocked = checkUnlocked(will);
    const alreadyRevealed = typeof window !== "undefined" && !!localStorage.getItem(WILL_UNLOCK_KEY(will.id));

    const current = will.milestone === "workouts" ? myWorkoutCount : myStreak;
    const pct = Math.min(100, Math.round((current / will.milestoneValue) * 100));
    const gap = Math.max(0, will.milestoneValue - current);

    return (
      <div className="p-4 rounded-2xl" style={{ background: "#131313", border: `1px solid ${unlocked ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}` }}>
        <div className="flex items-center gap-2.5 mb-3">
          {will.authorPhoto ? (
            <img src={will.authorPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 32, height: 32, background: "#2a2a2a", color: "#888" }}>
              {will.authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{will.authorName}</p>
            <p className="text-[10px]" style={{ color: "#555" }}>Fitness Will · {milestoneLabel(will)}</p>
          </div>
          {will.recipientCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}>
              {will.recipientCount} unlocked
            </span>
          )}
        </div>

        {unlocked ? (
          <div>
            <p className="text-sm leading-relaxed mb-2" style={{ color: "#f2f2f2" }}>{will.message}</p>
            {!alreadyRevealed && (
              <button
                onClick={() => handleReveal(will)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer"
                style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                🎉 Mark as read
              </button>
            )}
            {alreadyRevealed && <span className="text-xs" style={{ color: "#22c55e" }}>🎉 You unlocked this message</span>}
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "#555" }}>
              🔒 <span style={{ color: "#f2f2f2" }}>{gap} {will.milestone === "workouts" ? "workouts" : "streak days"}</span> away from unlocking {will.authorName.split(" ")[0]}&apos;s message
            </p>
            {showProgress && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: "#555" }}>{current} / {will.milestoneValue}</span>
                  <span className="text-[10px] font-bold" style={{ color: "#a78bfa" }}>{pct}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: "#1f1f1f" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#a78bfa" }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-24 overflow-x-hidden">
      <PageHeader title="Fitness Will" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0c0618 0%,#130a24 50%,#0c0618 100%)", border: "1px solid rgba(167,139,250,0.2)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.25) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>history_edu</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>FITNESS WILL</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Fitness Will</h1>
          <p className="text-sm" style={{ color: "#555" }}>Leave your legacy — unlocks when followers hit a milestone</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{myWorkoutCount}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>your workouts</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{myStreak}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>day streak</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["feed", "create", "community"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-full text-sm font-semibold border-none cursor-pointer"
              style={{ background: tab === t ? "#f2f2f2" : "rgba(255,255,255,0.07)", color: tab === t ? "#000" : "#666" }}>
              {t === "feed" ? "Following" : t === "create" ? "Create" : "Top Wills"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : (
          <>
            {/* FOLLOWING FEED */}
            {tab === "feed" && (
              followingWills.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3" style={{ color: "#555" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48 }}>history_edu</span>
                  <p className="text-sm text-center">No wills from people you follow yet. Follow more users or check Top Wills.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {followingWills.map((w) => <WillCard key={w.id} will={w} showProgress />)}
                </div>
              )
            )}

            {/* CREATE */}
            {tab === "create" && (
              <div className="rounded-2xl p-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>WRITE YOUR FITNESS WILL</p>
                <p className="text-xs mb-4" style={{ color: "#555" }}>Leave advice or a message for your followers — they&apos;ll unlock it when they hit a milestone.</p>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message to future followers…"
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none mb-4"
                  style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }}
                />

                <p className="text-xs mb-2" style={{ color: "#555" }}>Unlocks when follower reaches:</p>
                <div className="flex gap-2 mb-3">
                  {(["workouts", "streak"] as const).map((t) => (
                    <button key={t} onClick={() => setMilestone(t)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
                      style={{ background: milestone === t ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: milestone === t ? "#a78bfa" : "#555", border: `1px solid ${milestone === t ? "rgba(167,139,250,0.3)" : "transparent"}` }}>
                      {t === "workouts" ? "Workout Count" : "Day Streak"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 mb-5">
                  <input
                    type="number"
                    value={milestoneValue}
                    onChange={(e) => setMilestoneValue(e.target.value)}
                    min="1"
                    className="flex-1 px-3 py-2 rounded-xl outline-none text-sm text-center"
                    style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }}
                  />
                  <span className="text-sm" style={{ color: "#666" }}>
                    {milestone === "workouts" ? "workouts" : "days in a row"}
                  </span>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={saving || !message.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: saving || !message.trim() ? "#222" : "#a78bfa", color: saving || !message.trim() ? "#444" : "#fff" }}>
                  {saving ? "Publishing…" : "📜 Publish Will"}
                </button>
              </div>
            )}

            {/* COMMUNITY */}
            {tab === "community" && (
              communityWills.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3" style={{ color: "#555" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48 }}>history_edu</span>
                  <p className="text-sm">No wills yet — be the first to write one.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {communityWills.map((w) => <WillCard key={w.id} will={w} showProgress />)}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
