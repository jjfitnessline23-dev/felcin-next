"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

type ChallengeType = "general" | "run" | "cycle";

interface Challenge {
  id: string; title: string; description?: string;
  type?: ChallengeType;
  targetDistanceM?: number;
  creatorId: string; creatorName: string; creatorPhoto?: string;
  nodeCount?: number; createdAt?: { seconds: number };
}

function timeAgo(seconds: number) {
  const d = Date.now() / 1000 - seconds;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const TYPE_CONFIG: Record<ChallengeType, { icon: string; color: string; bg: string; border: string; label: string }> = {
  general: { icon: "link",           color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)",  label: "Challenge" },
  run:     { icon: "directions_run", color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",   label: "Run Challenge" },
  cycle:   { icon: "directions_bike",color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)",  label: "Cycling Challenge" },
};

function fmtDist(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
  return `${m} m`;
}

export default function ChallengesPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | ChallengeType>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<ChallengeType>("general");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [targetKm, setTargetKm] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    getDocs(query(collection(db, "challenges"), orderBy("createdAt", "desc")))
      .then((snap) => {
        setChallenges(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Challenge, "id">) })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const filtered = tab === "all" ? challenges : challenges.filter(c => (c.type || "general") === tab);

  function resetCreate() { setTitle(""); setDesc(""); setTargetKm(""); setCreateType("general"); setShowCreate(false); }

  async function saveChallenge() {
    if (!user || !title.trim() || saving) return;
    setSaving(true);
    try {
      const targetDistanceM = (createType !== "general" && targetKm.trim())
        ? Math.round(parseFloat(targetKm) * 1000)
        : null;
      const ref = await addDoc(collection(db, "challenges"), {
        title: title.trim(), description: desc.trim() || null,
        type: createType,
        ...(targetDistanceM ? { targetDistanceM } : {}),
        creatorId: user.uid, creatorName: user.displayName || "User",
        creatorPhoto: user.photoURL || null,
        nodeCount: 1, createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "challenges", ref.id, "nodes"), {
        userId: user.uid, userName: user.displayName || "User",
        userPhoto: user.photoURL || null, parentNodeId: null,
        completedAt: serverTimestamp(), taggedUsers: [],
      });
      setChallenges((p) => [{
        id: ref.id, title: title.trim(), description: desc.trim() || undefined,
        type: createType, targetDistanceM: targetDistanceM ?? undefined,
        creatorId: user.uid, creatorName: user.displayName || "User",
        creatorPhoto: user.photoURL || undefined, nodeCount: 1,
      }, ...p]);
      resetCreate();
    } catch {}
    setSaving(false);
  }

  const tabs: Array<{ key: "all" | ChallengeType; label: string; icon: string }> = [
    { key: "all",     label: "All",     icon: "apps" },
    { key: "general", label: "General", icon: "link" },
    { key: "run",     label: "Running", icon: "directions_run" },
    { key: "cycle",   label: "Cycling", icon: "directions_bike" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) resetCreate(); }}>
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)" }}>
            <p className="text-base font-bold mb-4" style={{ color: "#f2f2f2" }}>Start a Challenge</p>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              {(["general", "run", "cycle"] as ChallengeType[]).map(t => {
                const cfg = TYPE_CONFIG[t];
                const active = createType === t;
                return (
                  <button key={t} onClick={() => setCreateType(t)} style={{
                    flex: 1, padding: "10px 4px", borderRadius: 12, border: `1px solid ${active ? cfg.border : "rgba(255,255,255,0.08)"}`,
                    background: active ? cfg.bg : "transparent", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: active ? cfg.color : "#444", fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: active ? cfg.color : "#444" }}>
                      {t === "general" ? "General" : t === "run" ? "Running" : "Cycling"}
                    </span>
                  </button>
                );
              })}
            </div>

            <input type="text"
              placeholder={createType === "run" ? "e.g. 5K Run Challenge" : createType === "cycle" ? "e.g. 20 Mile Cycling Challenge" : "Challenge title (e.g. 100 Push-up Challenge)"}
              value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            {createType !== "general" && (
              <div className="relative mb-3">
                <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#555", fontVariationSettings: "'FILL' 1" }}>
                  {createType === "run" ? "directions_run" : "directions_bike"}
                </span>
                <input type="number" placeholder="Target distance in km (optional — e.g. 5)"
                  value={targetKm} onChange={(e) => setTargetKm(e.target.value)} min="0" step="0.1"
                  className="w-full pl-10 pr-4 py-3 rounded-xl outline-none text-sm"
                  style={{ background: "#1a1a1a", border: `1px solid ${TYPE_CONFIG[createType].border}`, color: "#f2f2f2" }} />
              </div>
            )}

            <textarea placeholder="Describe the challenge rules…" value={desc}
              onChange={(e) => setDesc(e.target.value)} maxLength={400} rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-4 resize-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            <p className="text-xs mb-4" style={{ color: "#444" }}>
              {createType === "general"
                ? "You'll be the first link. Tag 3 followers to keep the chain going."
                : `Log a ${createType === "run" ? "run" : "ride"}${targetKm ? ` of ${targetKm} km or more` : ""} to complete this challenge.`}
            </p>
            <button onClick={saveChallenge} disabled={!title.trim() || saving}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: (!title.trim() || saving) ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: (!title.trim() || saving) ? "#444" : "#000" }}>
              {saving ? "Starting…" : "Start Challenge"}
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden mb-5"
        style={{ background: "linear-gradient(135deg,#120800 0%,#1c0e00 50%,#120800 100%)", border: "1px solid rgba(245,158,11,0.22)", minHeight: 140 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(245,158,11,0.28) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 140, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(30deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#f59e0b", fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#f59e0b", letterSpacing: "0.18em" }}>CHALLENGES</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fcd34d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Challenge Chains</h1>
          <p className="text-sm" style={{ color: "#555" }}>Running, cycling, or anything — complete it and pass it on.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer", flexShrink: 0,
            background: tab === t.key ? "#f2f2f2" : "#131313",
            color: tab === t.key ? "#000" : "#555",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
        <button onClick={() => setShowCreate(true)} style={{
          padding: "8px 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", flexShrink: 0, marginLeft: "auto",
          background: "transparent", color: "#f2f2f2", fontSize: 12, fontWeight: 700,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          New
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-3xl" style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, display: "block", color: "#1e1e1e", marginBottom: 12 }}>
            {tab === "run" ? "directions_run" : tab === "cycle" ? "directions_bike" : "emoji_events"}
          </span>
          <p className="text-base font-semibold mb-1" style={{ color: "#f2f2f2" }}>No {tab === "all" ? "" : tab + " "}challenges yet</p>
          <p className="text-sm mb-5" style={{ color: "#555" }}>Be the first to start one</p>
          <button onClick={() => { setCreateType(tab === "all" ? "general" : tab as ChallengeType); setShowCreate(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Start Challenge
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => {
            const cfg = TYPE_CONFIG[c.type || "general"];
            const init = (c.creatorName || "U").charAt(0).toUpperCase();
            return (
              <Link key={c.id} href={`/challenges/${c.id}`}
                className="p-4 rounded-2xl block"
                style={{ background: "#131313", border: `1px solid ${cfg.border}` }}>
                <div className="flex items-start gap-3">
                  {/* Type icon badge */}
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: cfg.color, fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{c.title}</p>
                      {c.type && c.type !== "general" && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: "2px 7px", borderRadius: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {c.type === "run" ? "Run" : "Cycle"}
                        </span>
                      )}
                    </div>
                    {c.targetDistanceM && (
                      <p className="text-xs mb-0.5" style={{ color: cfg.color, fontWeight: 600 }}>
                        Target: {fmtDist(c.targetDistanceM)}
                      </p>
                    )}
                    {c.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "#666" }}>{c.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#555" }}>group</span>
                        <span className="text-xs" style={{ color: "#555" }}>{c.nodeCount ?? 1} joined</span>
                      </div>
                      {c.creatorPhoto
                        ? <img src={c.creatorPhoto} alt="" className="rounded-full object-cover" style={{ width: 16, height: 16 }} />
                        : <div className="rounded-full flex items-center justify-center font-bold" style={{ width: 16, height: 16, background: "#222", color: "#aaa", fontSize: 8 }}>{init}</div>}
                      <span className="text-xs truncate" style={{ color: "#444" }}>{c.creatorName}</span>
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
