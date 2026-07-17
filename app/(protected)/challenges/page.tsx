"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Challenge {
  id: string; title: string; description?: string;
  creatorId: string; creatorName: string; creatorPhoto?: string;
  nodeCount?: number; createdAt?: { seconds: number };
}

function timeAgo(seconds: number) {
  const d = Date.now() / 1000 - seconds;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function ChallengesPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    getDocs(query(collection(db, "challenges"), orderBy("createdAt", "desc")))
      .then((snap) => {
        setChallenges(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Challenge, "id">) })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  async function saveChallenge() {
    if (!user || !title.trim() || saving) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "challenges"), {
        title: title.trim(), description: desc.trim() || null,
        creatorId: user.uid, creatorName: user.displayName || "User",
        creatorPhoto: user.photoURL || null,
        nodeCount: 1, createdAt: serverTimestamp(),
      });
      // Add the creator as the first node
      await addDoc(collection(db, "challenges", ref.id, "nodes"), {
        userId: user.uid, userName: user.displayName || "User",
        userPhoto: user.photoURL || null, parentNodeId: null,
        completedAt: serverTimestamp(), taggedUsers: [],
      });
      setChallenges((p) => [{
        id: ref.id, title: title.trim(), description: desc.trim() || undefined,
        creatorId: user.uid, creatorName: user.displayName || "User",
        creatorPhoto: user.photoURL || undefined, nodeCount: 1,
      }, ...p]);
      setShowCreate(false); setTitle(""); setDesc("");
    } catch {}
    setSaving(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)" }}>
            <p className="text-base font-bold mb-4" style={{ color: "#f2f2f2" }}>Start a Challenge Chain</p>
            <input type="text" placeholder="Challenge title (e.g. 100 Push-up Challenge)"
              value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <textarea placeholder="Describe the challenge rules…" value={desc}
              onChange={(e) => setDesc(e.target.value)} maxLength={400} rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-4 resize-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <p className="text-xs mb-4" style={{ color: "#444" }}>
              You&apos;ll be the first link. Tag 3 followers to keep the chain going — they&apos;ll have 48 hours to complete it.
            </p>
            <button onClick={saveChallenge} disabled={!title.trim() || saving}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: (!title.trim() || saving) ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: (!title.trim() || saving) ? "#444" : "#000" }}>
              {saving ? "Starting…" : "Start Chain"}
            </button>
          </div>
        </div>
      )}

      {/* Cinematic Hero */}
      <div className="relative rounded-3xl overflow-hidden mb-6"
        style={{ background: "linear-gradient(135deg,#120800 0%,#1c0e00 50%,#120800 100%)", border: "1px solid rgba(245,158,11,0.22)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(245,158,11,0.28) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(30deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#f59e0b", fontVariationSettings: "'FILL' 1" }}>link</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#f59e0b", letterSpacing: "0.18em" }}>CHALLENGE CHAINS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fcd34d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Challenge Chains</h1>
          <p className="text-sm" style={{ color: "#555" }}>Complete it. Tag 3. Keep it going.</p>
          {!loading && challenges.length > 0 && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#f59e0b" }}>{challenges.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>active chains</span></div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : challenges.length === 0 ? (
        <div className="ghost-bg text-center py-20 rounded-3xl">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#333" }}>link</span>
          </div>
          <p className="text-lg font-semibold mb-1" style={{ color: "#f2f2f2" }}>No chains yet</p>
          <p className="text-sm mb-5" style={{ color: "#555" }}>Start the first challenge chain</p>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Start Chain
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {challenges.map((c) => {
            const init = (c.creatorName || "U").charAt(0).toUpperCase();
            return (
              <Link key={c.id} href={`/challenges/${c.id}`}
                className="p-4 rounded-2xl block"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-start gap-3">
                  {c.creatorPhoto
                    ? <img src={c.creatorPhoto} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: 36, height: 36 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>{init}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{c.title}</p>
                    {c.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "#666" }}>{c.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#555" }}>link</span>
                        <span className="text-xs" style={{ color: "#555" }}>{c.nodeCount ?? 1} in the chain</span>
                      </div>
                      {c.createdAt && <>
                        <span style={{ color: "#333", fontSize: 10 }}>·</span>
                        <span className="text-xs" style={{ color: "#444" }}>{timeAgo(c.createdAt.seconds)}</span>
                      </>}
                    </div>
                  </div>
                  <span className="material-symbols-outlined flex-shrink-0 mt-1" style={{ fontSize: 18, color: "#333" }}>chevron_right</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
