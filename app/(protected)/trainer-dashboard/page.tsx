"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, addDoc, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface TrainerProfile {
  displayName: string;
  photoURL?: string;
  bio: string;
  specialty: string[];
  ratePerSession: number;
  isActive: boolean;
  sessionCount: number;
}

interface TrainingSession {
  id: string;
  trainerId: string;
  traineeId: string;
  traineeName?: string;
  traineePhoto?: string;
  sessionDate: string;
  status: "pending" | "accepted" | "declined" | "completed";
  price?: number;
  exercises: PlannedExercise[];
  notes: string;
  createdAt?: string;
}

interface PlannedSet { reps: number; weight: number; }
interface PlannedExercise { name: string; sets: PlannedSet[]; equipment?: string; }

const SPECIALTIES = ["Strength", "Cardio", "HIIT", "Yoga", "Bodybuilding", "Weight Loss", "Mobility", "Powerlifting", "CrossFit", "Boxing"];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#22c55e",
  declined: "#ef4444",
  completed: "#6d28d9",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

export default function TrainerDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "requests" | "sessions">("profile");

  /* Profile state */
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [bio, setBio] = useState("");
  const [rate, setRate] = useState("");
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  /* Sessions state */
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  /* Log editor state */
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editExercises, setEditExercises] = useState<PlannedExercise[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  /* Manual session creator */
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newTraineeName, setNewTraineeName] = useState("");
  const [newTraineeId, setNewTraineeId] = useState("");
  const [newSessionDate, setNewSessionDate] = useState("");
  const [newSessionTime, setNewSessionTime] = useState("10:00");
  const [creatingSession, setCreatingSession] = useState(false);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "trainerProfiles", user.uid);
    import("firebase/firestore").then(({ getDoc }) => {
      getDoc(ref).then((snap) => {
        if (snap.exists()) {
          const d = snap.data() as TrainerProfile;
          setProfile(d);
          setBio(d.bio || "");
          setRate(d.ratePerSession ? String(d.ratePerSession / 100) : "");
          setSelectedSpecs(d.specialty || []);
          setIsActive(d.isActive ?? false);
        }
        setProfileLoaded(true);
      }).catch(() => setProfileLoaded(true));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setSessionsLoading(true);
    getDocs(query(collection(db, "trainingSessions"), where("trainerId", "==", user.uid), orderBy("createdAt", "desc")))
      .then((snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrainingSession, "id">) })));
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [user]);

  const saveProfile = async () => {
    if (!user || savingProfile) return;
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const rateVal = Math.round(parseFloat(rate || "0") * 100);
      const data: TrainerProfile = {
        displayName: user.displayName || "Trainer",
        photoURL: user.photoURL || undefined,
        bio,
        specialty: selectedSpecs,
        ratePerSession: rateVal,
        isActive,
        sessionCount: profile?.sessionCount ?? 0,
      };
      await setDoc(doc(db, "trainerProfiles", user.uid), data, { merge: true });
      setProfile(data);
      setProfileStatus({ msg: "Profile saved!", ok: true });
    } catch {
      setProfileStatus({ msg: "Failed to save. Try again.", ok: false });
    }
    setSavingProfile(false);
  };

  const toggleSpec = (s: string) => {
    setSelectedSpecs((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleAccept = async (sessionId: string) => {
    await updateDoc(doc(db, "trainingSessions", sessionId), { status: "accepted" });
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "accepted" } : s));
  };

  const handleDecline = async (sessionId: string) => {
    await updateDoc(doc(db, "trainingSessions", sessionId), { status: "declined" });
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "declined" } : s));
  };

  const openLogEditor = (s: TrainingSession) => {
    setEditingSession(s.id);
    setEditExercises(s.exercises?.length ? s.exercises : [{ name: "", sets: [{ reps: 10, weight: 0 }] }]);
    setEditNotes(s.notes || "");
  };

  const saveLog = async () => {
    if (!editingSession || savingLog) return;
    setSavingLog(true);
    try {
      await updateDoc(doc(db, "trainingSessions", editingSession), {
        exercises: editExercises.filter((e) => (e.name || "").trim()),
        notes: editNotes,
      });
      setSessions((prev) => prev.map((s) => s.id === editingSession
        ? { ...s, exercises: editExercises.filter((e) => (e.name || "").trim()), notes: editNotes }
        : s
      ));
      setEditingSession(null);
    } catch {}
    setSavingLog(false);
  };

  const mutateEx = (fn: (exs: PlannedExercise[]) => PlannedExercise[]) => setEditExercises(fn);

  const createManualSession = async () => {
    if (!user || !newSessionDate || creatingSession) return;
    setCreatingSession(true);
    try {
      const sessionDate = `${newSessionDate}T${newSessionTime}:00`;
      const ref = await addDoc(collection(db, "trainingSessions"), {
        trainerId: user.uid,
        trainerName: user.displayName || "Trainer",
        trainerPhoto: user.photoURL || "",
        traineeId: newTraineeId || "",
        traineeName: newTraineeName || "Client",
        traineePhoto: "",
        sessionDate,
        status: "accepted",
        exercises: [],
        notes: "",
        price: 0,
        createdAt: serverTimestamp(),
      });
      const newSession: TrainingSession = {
        id: ref.id, trainerId: user.uid, traineeId: newTraineeId || "",
        traineeName: newTraineeName || "Client", sessionDate,
        status: "accepted", exercises: [], notes: "",
      };
      setSessions((prev) => [newSession, ...prev]);
      setShowCreateSession(false);
      setNewTraineeName(""); setNewTraineeId(""); setNewSessionDate(""); setNewSessionTime("10:00");
    } catch {}
    setCreatingSession(false);
  };

  const pending = sessions.filter((s) => s.status === "pending");
  const upcoming = sessions.filter((s) => s.status === "accepted" && new Date(s.sessionDate) >= new Date());
  const past = sessions.filter((s) => s.status === "completed" || (s.status === "accepted" && new Date(s.sessionDate) < new Date()));

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Trainer Dashboard" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#080412 0%,#0c0620 50%,#080412 100%)", border: "1px solid rgba(167,139,250,0.22)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.28) 0%,rgba(34,197,94,0.08) 45%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>school</span>
                </div>
                <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>TRAINER DASHBOARD</span>
              </div>
              <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 55%,#86efac 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Trainer Hub</h1>
              <p className="text-sm" style={{ color: "#555" }}>Manage your clients, sessions, and profile</p>
            </div>
            {/* Active status pill */}
            {profile && (
              <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: isActive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${isActive ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.1)"}` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: isActive ? "#22c55e" : "#555", animation: isActive ? "onAirPulse 1.5s infinite" : "none" }} />
                <span className="text-xs font-bold" style={{ color: isActive ? "#22c55e" : "#555" }}>{isActive ? "LISTED" : "HIDDEN"}</span>
              </div>
            )}
          </div>
          {!sessionsLoading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: pending.length > 0 ? "#f59e0b" : "#a78bfa" }}>{pending.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>pending</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{upcoming.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>upcoming</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{sessions.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>total</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-3 mb-4 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["profile", "requests", "sessions"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer capitalize relative"
            style={{ background: tab === t ? "#f2f2f2" : "transparent", color: tab === t ? "#000" : "#555" }}>
            {t}
            {t === "requests" && pending.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1"
                style={{ background: "#ef4444" }}>{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* PROFILE TAB */}
      {tab === "profile" && profileLoaded && (
        <div className="px-4 flex flex-col gap-4">
          {/* Active toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Listed as Trainer</p>
              <p className="text-xs mt-0.5" style={{ color: "#555" }}>Appear in the trainer marketplace</p>
            </div>
            <button onClick={() => setIsActive((v) => !v)}
              className="border-none cursor-pointer rounded-full transition-all shrink-0"
              style={{
                width: 44, height: 26, padding: 3,
                background: isActive ? "#a78bfa" : "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center",
              }}>
              <div className="rounded-full transition-all"
                style={{ width: 20, height: 20, background: "#fff", transform: isActive ? "translateX(18px)" : "translateX(0)" }} />
            </button>
          </div>

          {/* Bio */}
          <div className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>YOUR BIO</p>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4}
              placeholder="Tell clients about your training style, experience, and what you specialize in…"
              className="w-full bg-transparent outline-none text-sm resize-none"
              style={{ color: "#f2f2f2", caretColor: "#a78bfa" }} />
          </div>

          {/* Rate */}
          <div className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>RATE PER SESSION (USD)</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ color: "#555" }}>$</span>
              <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} min={0} step={5}
                placeholder="50"
                className="flex-1 bg-transparent outline-none text-xl font-bold"
                style={{ color: "#f2f2f2", border: "none" }} />
              <span className="text-sm" style={{ color: "#555" }}>per session</span>
            </div>
          </div>

          {/* Specialties */}
          <div className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>SPECIALTIES</p>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map((s) => (
                <button key={s} onClick={() => toggleSpec(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer"
                  style={{ background: selectedSpecs.includes(s) ? "#a78bfa" : "rgba(255,255,255,0.07)", color: selectedSpecs.includes(s) ? "#000" : "#777" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {profileStatus && (
            <p className="text-sm text-center" style={{ color: profileStatus.ok ? "#22c55e" : "#ef4444" }}>{profileStatus.msg}</p>
          )}

          <button onClick={saveProfile} disabled={savingProfile}
            className="w-full py-3.5 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: savingProfile ? "#2a2a2a" : "#a78bfa", color: savingProfile ? "#555" : "#000" }}>
            {savingProfile ? "Saving…" : "Save Trainer Profile"}
          </button>

          <button onClick={() => router.push(`/trainers/${user?.uid}`)}
            className="w-full py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", color: "#666" }}>
            Preview My Trainer Page
          </button>
        </div>
      )}

      {/* REQUESTS TAB */}
      {tab === "requests" && (
        <div className="px-4 flex flex-col gap-3">
          {sessionsLoading ? (
            <div className="flex justify-center py-12"><div className="spinner" /></div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#333" }}>inbox</span>
              <p className="text-sm" style={{ color: "#555" }}>No pending session requests</p>
            </div>
          ) : pending.map((s) => (
            <div key={s.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center gap-3 mb-3">
                {s.traineePhoto ? (
                  <img src={s.traineePhoto} alt="" className="rounded-full object-cover" style={{ width: 40, height: 40 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ width: 40, height: 40, background: "#222", color: "#888" }}>
                    {(s.traineeName || "C").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{s.traineeName || "New client"}</p>
                  <p className="text-xs" style={{ color: "#666" }}>{fmtDate(s.sessionDate)}</p>
                </div>
                {s.price ? <p className="text-sm font-bold" style={{ color: "#22c55e" }}>${(s.price / 100).toFixed(0)}</p> : null}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAccept(s.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
                  Accept
                </button>
                <button onClick={() => handleDecline(s.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SESSIONS TAB */}
      {tab === "sessions" && (
        <div className="px-4">
          {/* Create session button */}
          <button onClick={() => setShowCreateSession(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border-none cursor-pointer mb-4"
            style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px dashed rgba(167,139,250,0.3)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Create Session for a Client
          </button>

          {sessionsLoading ? (
            <div className="flex justify-center py-12"><div className="spinner" /></div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>UPCOMING</p>
                  <div className="flex flex-col gap-3 mb-5">
                    {upcoming.map((s) => <SessionCard key={s.id} session={s} onEdit={() => openLogEditor(s)} onView={() => router.push(`/training-sessions/${s.id}`)} />)}
                  </div>
                </>
              )}
              {past.length > 0 && (
                <>
                  <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>PAST</p>
                  <div className="flex flex-col gap-3">
                    {past.map((s) => <SessionCard key={s.id} session={s} onEdit={() => openLogEditor(s)} onView={() => router.push(`/training-sessions/${s.id}`)} />)}
                  </div>
                </>
              )}
              {upcoming.length === 0 && past.length === 0 && (
                <div className="flex flex-col items-center py-16 gap-3">
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#333" }}>calendar_month</span>
                  <p className="text-sm" style={{ color: "#555" }}>No sessions yet</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Log editor overlay */}
      {editingSession && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="min-h-full flex items-end">
            <div className="w-full max-w-xl mx-auto rounded-t-2xl"
              style={{ background: "#111", borderTop: "1px solid rgba(255,255,255,0.1)", maxHeight: "90dvh", overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
              <div className="sticky top-0 flex items-center justify-between px-5 py-4" style={{ background: "#111", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>Build Workout Log</p>
                <button onClick={() => setEditingSession(null)} className="border-none bg-transparent cursor-pointer">
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555" }}>close</span>
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4">
                {editExercises.map((ex, ei) => (
                  <div key={ei} className="p-4 rounded-2xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <input type="text" placeholder={`Exercise ${ei + 1}`} value={ex.name}
                        onChange={(e) => mutateEx((xs) => xs.map((x, i) => i !== ei ? x : { ...x, name: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                        style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                      {editExercises.length > 1 && (
                        <button onClick={() => mutateEx((xs) => xs.filter((_, i) => i !== ei))} className="border-none bg-transparent cursor-pointer shrink-0">
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>close</span>
                        </button>
                      )}
                    </div>
                    <div className="flex text-[10px] font-bold mb-2 px-1 gap-2" style={{ color: "#444" }}>
                      <span style={{ width: 20 }}>#</span>
                      <span className="flex-1 text-center">Reps</span>
                      <span className="flex-1 text-center">Weight (kg)</span>
                      <span style={{ width: 18 }} />
                    </div>
                    {ex.sets.map((set, si) => (
                      <div key={si} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-center tabular-nums" style={{ width: 20, color: "#555" }}>{si + 1}</span>
                        <input type="number" value={set.reps} min={0}
                          onChange={(e) => mutateEx((xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, reps: Number(e.target.value) }) }))}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                          style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                        <input type="number" value={set.weight} min={0} step={2.5}
                          onChange={(e) => mutateEx((xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.map((s, j) => j !== si ? s : { ...s, weight: Number(e.target.value) }) }))}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                          style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                        <button onClick={() => mutateEx((xs) => xs.map((x, i) => i !== ei || x.sets.length <= 1 ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) }))}
                          className="border-none bg-transparent cursor-pointer shrink-0">
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#333" }}>remove</span>
                        </button>
                      </div>
                    ))}
                    <button onClick={() => mutateEx((xs) => xs.map((x, i) => i !== ei ? x : { ...x, sets: [...x.sets, { reps: x.sets.at(-1)?.reps ?? 10, weight: x.sets.at(-1)?.weight ?? 0 }] }))}
                      className="mt-1 flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span> Add set
                    </button>
                  </div>
                ))}

                <button onClick={() => mutateEx((xs) => [...xs, { name: "", sets: [{ reps: 10, weight: 0 }] }])}
                  className="w-full py-2.5 rounded-xl text-sm border-none cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px dashed rgba(255,255,255,0.1)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span> Add Exercise
                </button>

                <div>
                  <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>TRAINER NOTES</p>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                    placeholder="Instructions, cues, or notes for your client…"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                </div>

                <button onClick={saveLog} disabled={savingLog}
                  className="w-full py-3.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: savingLog ? "#2a2a2a" : "#22c55e", color: savingLog ? "#555" : "#000" }}>
                  {savingLog ? "Saving…" : "Save Workout Log"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create session modal */}
      {showCreateSession && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-xl mx-auto rounded-t-2xl p-6"
            style={{ background: "#111", borderTop: "1px solid rgba(255,255,255,0.1)", paddingBottom: "env(safe-area-inset-bottom, 24px)" }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>New Session</p>
              <button onClick={() => setShowCreateSession(false)} className="border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555" }}>close</span>
              </button>
            </div>

            <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Client Name</p>
            <input type="text" value={newTraineeName} onChange={(e) => setNewTraineeName(e.target.value)}
              placeholder="Client's name"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Client Felcin UID <span style={{ color: "#444" }}>(optional — links their account)</span></p>
            <input type="text" value={newTraineeId} onChange={(e) => setNewTraineeId(e.target.value)}
              placeholder="e.g. abc123xyz"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            <div className="flex gap-3 mb-5">
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Date</p>
                <input type="date" min={today} value={newSessionDate} onChange={(e) => setNewSessionDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Time</p>
                <input type="time" value={newSessionTime} onChange={(e) => setNewSessionTime(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              </div>
            </div>

            <button onClick={createManualSession} disabled={!newSessionDate || !newTraineeName || creatingSession}
              className="w-full py-3.5 rounded-xl text-sm font-bold border-none cursor-pointer"
              style={{ background: newSessionDate && newTraineeName && !creatingSession ? "#a78bfa" : "#2a2a2a", color: newSessionDate && newTraineeName && !creatingSession ? "#000" : "#555" }}>
              {creatingSession ? "Creating…" : "Create Session"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onEdit, onView }: { session: TrainingSession; onEdit: () => void; onView: () => void }) {
  const hasLog = session.exercises?.length > 0;
  return (
    <div className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ width: 38, height: 38, background: "#222", color: "#888" }}>
          {(session.traineeName || "C").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{session.traineeName || "Client"}</p>
          <p className="text-xs" style={{ color: "#666" }}>{fmtDate(session.sessionDate)}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
          style={{ background: `${STATUS_COLORS[session.status]}18`, color: STATUS_COLORS[session.status] }}>
          {session.status}
        </span>
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", color: hasLog ? "#22c55e" : "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span>
          {hasLog ? `${session.exercises.length} exercises` : "Build Log"}
        </button>
        <button onClick={onView}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", color: "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
          View Session
        </button>
      </div>
    </div>
  );
}

const today = new Date().toISOString().split("T")[0];
