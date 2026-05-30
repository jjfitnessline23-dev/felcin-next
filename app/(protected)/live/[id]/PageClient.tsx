"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  collection, doc, getDoc, addDoc, updateDoc, onSnapshot, setDoc,
  query, orderBy, limit, serverTimestamp, increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import AgoraVideo from "@/components/AgoraVideo";

const GIFTS = [
  { id: "rose",    emoji: "🌹", label: "Rose",    cents: 99  },
  { id: "heart",   emoji: "❤️",  label: "Heart",   cents: 99  },
  { id: "clap",    emoji: "👏", label: "Clap",    cents: 99  },
  { id: "fire",    emoji: "🔥", label: "Fire",    cents: 199 },
  { id: "star",    emoji: "⭐",  label: "Star",    cents: 199 },
  { id: "rocket",  emoji: "🚀", label: "Rocket",  cents: 299 },
  { id: "crown",   emoji: "👑", label: "Crown",   cents: 499 },
  { id: "diamond", emoji: "💎", label: "Diamond", cents: 999 },
];

const BADGE_LABELS: Record<string, { label: string; color: string }> = {
  verified:      { label: "Verified",      color: "#1d4ed8" },
  creator:       { label: "Creator",       color: "#059669" },
  fitness_coach: { label: "Fitness Coach", color: "#0891b2" },
  pro:           { label: "Pro Creator",   color: "#7c3aed" },
  athlete:       { label: "Athlete",       color: "#dc2626" },
  star:          { label: "Star Creator",  color: "#d97706" },
  brand:         { label: "Brand",         color: "#475569" },
  elite:         { label: "Elite",         color: "#be185d" },
};

type Privacy = "public" | "followers";

interface Stream {
  id: string; hostId: string; hostName?: string;
  hostPhoto?: string; title?: string; viewerCount?: number;
  privacy?: Privacy;
}
interface GiftEvent {
  id: string; senderId: string; senderName: string; senderPhoto?: string;
  badgeId?: string; giftType: string; giftEmoji: string; ts: number;
}
interface FlyingGift { key: string; emoji: string; x: number; }
interface RaceDoc { active: boolean; exerciseName: string; repTarget?: number; }
interface RaceScore { uid: string; userName: string; userPhoto?: string; reps: number; }

export default function StreamViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const streamId = params.id as string;
  const { user } = useAuth();

  const [stream, setStream] = useState<Stream | null>(null);
  const [gifts, setGifts] = useState<GiftEvent[]>([]);
  const [flying, setFlying] = useState<FlyingGift[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [userBadge, setUserBadge] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [endingStream, setEndingStream] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  // Race state
  const [race, setRace] = useState<RaceDoc | null>(null);
  const [raceScores, setRaceScores] = useState<RaceScore[]>([]);
  const [myReps, setMyReps] = useState(0);
  const [setupRaceName, setSetupRaceName] = useState("");
  const [setupRaceTarget, setSetupRaceTarget] = useState("");
  const [showRaceSetup, setShowRaceSetup] = useState(false);
  const [startingRace, setStartingRace] = useState(false);
  const repTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulse state
  const [pulseTotal, setPulseTotal] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const pulseScale = useRef(1);

  // Subscribe to stream in real-time so privacy changes reflect live
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, "streams", streamId), (snap) => {
      if (snap.exists()) {
        setStream({ id: snap.id, ...(snap.data() as Omit<Stream, "id">) });
      } else {
        setStream(null);
      }
      setLoading(false);
    }, () => setLoading(false));
  }, [streamId]);

  // Check access once stream and user are loaded
  useEffect(() => {
    if (!stream || !user) return;
    const isHost = user.uid === stream.hostId;
    if (isHost || stream.privacy !== "followers") {
      setHasAccess(true);
      setAccessChecked(true);
      return;
    }
    // Check if viewer follows the host
    getDoc(doc(db, "users", stream.hostId, "followers", user.uid)).then((snap) => {
      setHasAccess(snap.exists());
      setAccessChecked(true);
    }).catch(() => { setHasAccess(false); setAccessChecked(true); });
  }, [stream, user]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) setUserBadge(snap.data().badgeId ?? undefined);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    const q = query(
      collection(db, "streams", streamId, "gifts"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setGifts(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, senderId: data.senderId ?? "",
          senderName: data.senderName ?? "User",
          senderPhoto: data.senderPhoto ?? undefined,
          badgeId: data.badgeId ?? undefined,
          giftType: data.giftType ?? "rose",
          giftEmoji: data.giftEmoji ?? "🌹",
          ts: data.timestamp?.seconds ?? 0,
        };
      }));
    });
  }, [streamId]);

  // Race listener
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, "streams", streamId, "race", "current"), (snap) => {
      if (snap.exists()) setRace(snap.data() as RaceDoc);
      else setRace(null);
    });
  }, [streamId]);

  // Race scores listener
  useEffect(() => {
    if (!streamId || !race?.active) return;
    const q = query(collection(db, "streams", streamId, "raceScores"), orderBy("reps", "desc"), limit(20));
    return onSnapshot(q, (snap) => {
      setRaceScores(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RaceScore, "uid">) })));
    });
  }, [streamId, race?.active]);

  // Pulse listener
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, "streams", streamId, "pulse", "current"), (snap) => {
      if (snap.exists()) setPulseTotal(snap.data().totalTaps ?? 0);
    });
  }, [streamId]);

  // After Stripe gift payment
  useEffect(() => {
    const sessionId = searchParams.get("gift_session_id");
    if (!sessionId || !user) return;
    router.replace(`/live/${streamId}`);
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/gift-verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.ok) return;
        await addDoc(collection(db, "streams", streamId, "gifts"), {
          senderId: user.uid, senderName: user.displayName || "User",
          senderPhoto: user.photoURL ?? null, badgeId: userBadge ?? null,
          giftType: data.giftType, giftEmoji: data.giftEmoji,
          priceUsd: data.priceUsd, creatorShareUsd: data.creatorShareUsd,
          sessionId: data.sessionId, timestamp: serverTimestamp(),
        });
        if (data.hostId && data.creatorShareUsd > 0) {
          await addDoc(collection(db, "users", data.hostId, "earnings"), {
            type: "gift", fromUid: user.uid, giftType: data.giftType,
            giftEmoji: data.giftEmoji, streamId, amountUsd: data.creatorShareUsd,
            sessionId: data.sessionId, timestamp: serverTimestamp(),
          });
        }
        showToast(`${data.giftEmoji} Gift sent!`);
        triggerFly(data.giftEmoji);
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function triggerFly(emoji: string) {
    const key = `${Date.now()}-${Math.random()}`;
    const x = 10 + Math.random() * 75;
    setFlying((prev) => [...prev, { key, emoji, x }]);
    setTimeout(() => setFlying((prev) => prev.filter((f) => f.key !== key)), 2200);
  }

  async function startRace() {
    if (!setupRaceName.trim() || startingRace) return;
    setStartingRace(true);
    await setDoc(doc(db, "streams", streamId, "race", "current"), {
      active: true, exerciseName: setupRaceName.trim(),
      repTarget: Number(setupRaceTarget) || null, startedAt: serverTimestamp(),
    }).catch(() => {});
    setShowRaceSetup(false); setSetupRaceName(""); setSetupRaceTarget("");
    setStartingRace(false);
  }

  async function endRace() {
    await updateDoc(doc(db, "streams", streamId, "race", "current"), { active: false }).catch(() => {});
    setMyReps(0);
  }

  async function tapRep() {
    if (!user || !race?.active) return;
    const newReps = myReps + 1;
    setMyReps(newReps);
    if (repTapRef.current) clearTimeout(repTapRef.current);
    repTapRef.current = setTimeout(async () => {
      await setDoc(doc(db, "streams", streamId, "raceScores", user.uid), {
        userName: user.displayName || "User",
        userPhoto: user.photoURL || null,
        reps: newReps,
      }, { merge: true }).catch(() => {});
    }, 400);
  }

  async function sendPulse() {
    if (!user || pulsing) return;
    setPulsing(true);
    await setDoc(doc(db, "streams", streamId, "pulse", "current"), {
      totalTaps: increment(1),
    }, { merge: true }).catch(() => {});
    setTimeout(() => setPulsing(false), 600);
  }

  async function endStream() {
    if (!user || endingStream) return;
    setEndingStream(true);
    try {
      await updateDoc(doc(db, "streams", streamId), { status: "ended" });
      router.push("/live");
    } catch { setEndingStream(false); }
  }

  async function togglePrivacy() {
    if (!stream || togglingPrivacy) return;
    setTogglingPrivacy(true);
    const next: Privacy = stream.privacy === "followers" ? "public" : "followers";
    await updateDoc(doc(db, "streams", streamId), { privacy: next }).catch(() => {});
    setTogglingPrivacy(false);
  }

  async function sendGift(gift: typeof GIFTS[0]) {
    if (!user || sending || !stream) return;
    setSending(gift.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/gift-checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giftType: gift.id, streamId, hostId: stream.hostId, token }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { showToast(data.error || "Payment failed"); }
    } catch { showToast("Something went wrong"); }
    setSending(null);
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;

  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <p className="text-lg font-semibold mb-3" style={{ color: "#f2f2f2" }}>Stream not found</p>
        <Link href="/live" className="text-sm" style={{ color: "#888" }}>← Back to Live</Link>
      </div>
    );
  }

  const isHost = user?.uid === stream.hostId;
  const isPrivate = stream.privacy === "followers";

  // Show access gate for private streams
  if (!isHost && !accessChecked) {
    return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  }

  if (!isHost && !hasAccess) {
    const init = (stream.hostName || "U").charAt(0).toUpperCase();
    return (
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-4 flex-shrink-0"
          style={{ background: "#222" }}>
          {stream.hostPhoto
            ? <img src={stream.hostPhoto} alt="" className="w-full h-full object-cover" />
            : <span className="text-2xl font-bold" style={{ color: "#aaa" }}>{init}</span>}
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>lock</span>
          FOLLOWERS ONLY
        </div>
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: "#f2f2f2" }}>{stream.hostName}&apos;s Live</h2>
        <p className="text-sm text-center" style={{ color: "#555", maxWidth: 260 }}>
          This stream is private. Follow {stream.hostName} to watch.
        </p>
        <Link href={`/user-profile?uid=${stream.hostId}`}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm"
          style={{ background: "#ef4444", color: "#fff" }}>
          Follow to Watch
        </Link>
        <Link href="/live" className="mt-3 text-sm" style={{ color: "#555" }}>← Back to Live</Link>
      </div>
    );
  }

  const init = (stream.hostName || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <style>{`
        @keyframes giftFly {
          0%   { transform: translateY(0) scale(1);   opacity: 1; }
          70%  { transform: translateY(-160px) scale(1.4); opacity: 1; }
          100% { transform: translateY(-220px) scale(1.6); opacity: 0; }
        }
      `}</style>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: "rgba(30,30,30,0.95)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}

      <Link href="/live" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Live
      </Link>

      {/* Video area */}
      <div className="relative rounded-2xl overflow-hidden mb-4" style={{ background: "#0a0a0a", aspectRatio: "9/16", maxHeight: "70vh" }}>
        {/* Real Agora video stream */}
        <div className="absolute inset-0">
          <AgoraVideo channelName={streamId} isHost={isHost} />
        </div>
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "#ef4444" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "pulse 1.5s infinite" }} />
          <span className="text-xs font-bold text-white tracking-wide">LIVE</span>
        </div>
        {isPrivate && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.7)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fff" }}>lock</span>
            <span className="text-xs text-white font-medium">Followers</span>
          </div>
        )}
        {!isPrivate && stream.viewerCount !== undefined && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.7)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fff" }}>visibility</span>
            <span className="text-xs text-white font-medium">{stream.viewerCount}</span>
          </div>
        )}
        {flying.map((f) => (
          <div key={f.key} className="absolute pointer-events-none select-none"
            style={{ left: `${f.x}%`, bottom: 16, fontSize: 30, lineHeight: 1, animation: "giftFly 2.2s ease-out forwards" }}>
            {f.emoji}
          </div>
        ))}
      </div>

      {/* Host info */}
      <div className="flex items-center gap-3 mb-4">
        {stream.hostPhoto
          ? <img src={stream.hostPhoto} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: 42, height: 42 }} />
          : <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
              style={{ width: 42, height: 42, background: "#222", color: "#aaa", fontSize: 16 }}>{init}</div>}
        <div className="flex-1 min-w-0">
          <Link href={`/user-profile?uid=${stream.hostId}`} className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>
            {stream.hostName || "User"}
          </Link>
          {stream.title && <p className="text-xs mt-0.5 truncate" style={{ color: "#666" }}>{stream.title}</p>}
        </div>
        {isPrivate && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#ef4444" }}>lock</span>
            <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>Followers Only</span>
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost ? (
        <div className="rounded-2xl p-5 mb-4"
          style={{ background: "#131313", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444", animation: "pulse 1.5s infinite" }} />
              <span className="text-sm font-bold" style={{ color: "#f2f2f2" }}>You&apos;re Live</span>
            </div>
            {stream.viewerCount !== undefined && (
              <div className="flex items-center gap-1 ml-auto" style={{ color: "#666" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
                <span className="text-xs">{stream.viewerCount} watching</span>
              </div>
            )}
          </div>
          {stream.title && <p className="text-sm mb-4" style={{ color: "#888" }}>{stream.title}</p>}

          {/* Privacy toggle */}
          <button onClick={togglePrivacy} disabled={togglingPrivacy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-2 mb-3"
            style={{
              background: isPrivate ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
              color: isPrivate ? "#ef4444" : "#888",
              border: `1px solid ${isPrivate ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)"}`,
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {isPrivate ? "lock" : "public"}
            </span>
            {togglingPrivacy ? "Updating…" : isPrivate ? "Followers Only — tap to make Public" : "Public — tap to make Followers Only"}
          </button>

          <button onClick={endStream} disabled={endingStream}
            className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
            style={{ background: endingStream ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
            {endingStream
              ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Ending…</>
              : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>stop_circle</span> End Stream</>}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl p-4 mb-4"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold mb-3" style={{ color: "#666" }}>SEND A GIFT</p>
          <div className="grid grid-cols-4 gap-2">
            {GIFTS.map((gift) => (
              <button key={gift.id} onClick={() => sendGift(gift)} disabled={!!sending}
                className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl border-none cursor-pointer"
                style={{
                  background: sending === gift.id ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                  opacity: sending && sending !== gift.id ? 0.5 : 1,
                  transition: "background 0.15s, transform 0.1s",
                  transform: sending === gift.id ? "scale(0.94)" : "scale(1)",
                }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{gift.emoji}</span>
                <span className="text-xs font-medium mt-0.5" style={{ color: "#ccc" }}>{gift.label}</span>
                <span className="text-xs" style={{ color: "#555" }}>${(gift.cents / 100).toFixed(2)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-center mt-3" style={{ color: "#444" }}>70% goes directly to the creator</p>
        </div>
      )}

      {/* Recent gifts */}
      {gifts.length > 0 && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold mb-3" style={{ color: "#666" }}>RECENT GIFTS</p>
          <div className="flex flex-col gap-3">
            {gifts.slice(0, 10).map((g) => {
              const badge = g.badgeId ? BADGE_LABELS[g.badgeId] : undefined;
              const sinit = (g.senderName || "U").charAt(0).toUpperCase();
              return (
                <div key={g.id} className="flex items-center gap-3">
                  {g.senderPhoto
                    ? <img src={g.senderPhoto} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: 28, height: 28 }} />
                    : <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ width: 28, height: 28, background: "#222", color: "#aaa" }}>{sinit}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{g.senderName}</span>
                      {badge && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44` }}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "#666" }}>sent {g.giftEmoji} {g.giftType}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LIVE WORKOUT RACE ── */}
      {isHost && !race?.active && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Live Workout Race</p>
              <p className="text-xs mt-0.5" style={{ color: "#555" }}>Viewers race you — real-time rep leaderboard</p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555", fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
          </div>
          {showRaceSetup ? (
            <div className="flex flex-col gap-2">
              <input type="text" placeholder="Exercise (e.g. Push-ups)" value={setupRaceName}
                onChange={(e) => setSetupRaceName(e.target.value)} maxLength={40}
                className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              <input type="number" placeholder="Rep target (optional)" value={setupRaceTarget}
                onChange={(e) => setSetupRaceTarget(e.target.value)} min={1} max={999}
                className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              <div className="flex gap-2">
                <button onClick={() => setShowRaceSetup(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm border-none cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#555" }}>Cancel</button>
                <button onClick={startRace} disabled={!setupRaceName.trim() || startingRace}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: (!setupRaceName.trim() || startingRace) ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: (!setupRaceName.trim() || startingRace) ? "#444" : "#000" }}>
                  {startingRace ? "Starting…" : "Start Race"}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowRaceSetup(true)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-2"
              style={{ background: "rgba(255,255,255,0.06)", color: "#f2f2f2" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flag</span>
              Start a Race
            </button>
          )}
        </div>
      )}

      {race?.active && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#f2f2f2", animation: "pulse 1s infinite" }} />
              <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>RACE LIVE</p>
            </div>
            {isHost && (
              <button onClick={endRace} className="text-xs px-3 py-1 rounded-full border-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", color: "#666" }}>End Race</button>
            )}
          </div>
          <p className="text-xs mb-3" style={{ color: "#555" }}>{race.exerciseName}{race.repTarget ? ` — ${race.repTarget} rep target` : ""}</p>

          {/* Viewer rep counter */}
          {!isHost && (
            <button onClick={tapRep}
              className="w-full py-5 rounded-2xl text-center border-none cursor-pointer mb-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", transition: "transform 0.05s", transform: "scale(1)" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              <p className="text-5xl font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{myReps}</p>
              <p className="text-xs mt-1" style={{ color: "#555" }}>TAP TO REP</p>
            </button>
          )}

          {/* Leaderboard */}
          {raceScores.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-bold mb-1" style={{ color: "#444" }}>LEADERBOARD</p>
              {raceScores.slice(0, 5).map((s, i) => {
                const sinit = (s.userName || "U").charAt(0).toUpperCase();
                const isMe = user?.uid === s.uid;
                return (
                  <div key={s.uid} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                    style={{ background: isMe ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)" }}>
                    <span className="text-xs font-bold w-4 text-center" style={{ color: i === 0 ? "#f2f2f2" : "#444" }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </span>
                    {s.userPhoto
                      ? <img src={s.userPhoto} alt="" className="rounded-full object-cover" style={{ width: 24, height: 24 }} />
                      : <div className="rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ width: 24, height: 24, background: "#222", color: "#aaa" }}>{sinit}</div>}
                    <span className="flex-1 text-sm" style={{ color: isMe ? "#f2f2f2" : "#888" }}>{isMe ? "You" : s.userName}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "#f2f2f2" }}>{s.reps}</span>
                    {race.repTarget && (
                      <span className="text-xs" style={{ color: "#444" }}>/ {race.repTarget}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SYNC PULSE ── */}
      <div className="rounded-2xl p-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Sync Pulse</p>
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>Tap to send energy to the stream</p>
          </div>
          <div className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "#555" }}>
            {pulseTotal.toLocaleString()} pulses
          </div>
        </div>

        {/* Pulse ring visualization */}
        <div className="flex justify-center mb-4">
          <div className="relative flex items-center justify-center"
            style={{ width: 100, height: 100 }}>
            <div className="absolute inset-0 rounded-full"
              style={{
                background: pulseTotal > 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                border: `2px solid ${pulsing ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                transition: "border-color 0.2s, transform 0.15s",
                transform: pulsing ? "scale(1.12)" : "scale(1)",
              }} />
            <div className="absolute rounded-full"
              style={{
                inset: 12,
                background: pulsing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: `2px solid ${pulsing ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)"}`,
                transition: "background 0.2s, border-color 0.2s, transform 0.15s",
                transform: pulsing ? "scale(1.1)" : "scale(1)",
              }} />
            <span className="material-symbols-outlined relative"
              style={{ fontSize: 32, color: pulsing ? "#f2f2f2" : "#444", transition: "color 0.2s", fontVariationSettings: "'FILL' 1" }}>
              favorite
            </span>
          </div>
        </div>

        {!isHost && (
          <button onClick={sendPulse} disabled={pulsing}
            className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
            style={{
              background: pulsing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              color: pulsing ? "#888" : "#f2f2f2",
              border: "1px solid rgba(255,255,255,0.08)",
              transition: "background 0.15s, transform 0.1s",
              transform: pulsing ? "scale(0.97)" : "scale(1)",
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>favorite</span>
            {pulsing ? "Pulse sent!" : "Send Pulse"}
          </button>
        )}
        {isHost && (
          <p className="text-center text-xs" style={{ color: "#444" }}>
            Your viewers are sending you energy
          </p>
        )}
      </div>
    </div>
  );
}
