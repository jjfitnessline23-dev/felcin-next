"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Stream { id: string; hostId: string; hostName?: string; hostPhoto?: string; title?: string; viewerCount?: number; startedAt?: { seconds: number }; }

export default function LivePage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        setFollowers(snap.data().followersCount ?? 0);
      } else {
        getDoc(doc(db, "users", user.uid)).then((rootSnap) => {
          setFollowers(rootSnap.exists() ? (rootSnap.data().followersCount ?? 0) : 0);
        }).catch(() => setFollowers(0));
      }
    }).catch(() => setFollowers(0));
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, "streams"), where("status", "==", "live"));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stream, "id">) }));
      all.sort((a, b) => (b.startedAt?.seconds ?? 0) - (a.startedAt?.seconds ?? 0));
      setStreams(all);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  if (loading || followers === null) {
    return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  }

  if (followers < 300 && !OWNER_UIDS.includes(user?.uid ?? "")) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 44, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>lock</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
          300 FOLLOWERS REQUIRED
        </div>
        <h1 className="text-2xl font-bold text-center mb-3" style={{ color: "#f2f2f2" }}>Live Streams</h1>
        <p className="text-sm text-center leading-relaxed" style={{ color: "#555", maxWidth: 280 }}>
          Reach 300 followers to unlock live streaming. You currently have {followers} follower{followers !== 1 ? "s" : ""}.
        </p>
        <div className="mt-6 w-full max-w-xs">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: "#555" }}>
            <span>{followers} followers</span>
            <span>300 needed</span>
          </div>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (followers / 300) * 100)}%`, background: "#ef4444" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-3 h-3 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.6)", animation: "pulse 1.5s infinite" }} />
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Live Now</h1>
      </div>

      {streams.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#ef4444" }}>live_tv</span>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: "#f2f2f2" }}>No one is live</p>
          <p className="text-sm" style={{ color: "#555" }}>Check back later — streams appear here in real time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {streams.map((s) => {
            const init = (s.hostName || "U").charAt(0).toUpperCase();
            return (
              <div key={s.id} className="rounded-2xl overflow-hidden"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="relative" style={{ background: "#0a0a0a", aspectRatio: "16/9" }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#1a1a1a" }}>live_tv</span>
                  </div>
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: "#ef4444" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span className="text-xs font-bold text-white tracking-wide">LIVE</span>
                  </div>
                  {s.viewerCount !== undefined && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full"
                      style={{ background: "rgba(0,0,0,0.7)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fff" }}>visibility</span>
                      <span className="text-xs text-white font-medium">{s.viewerCount}</span>
                    </div>
                  )}
                </div>
                <div className="p-3.5">
                  <Link href={`/user-profile?uid=${s.hostId}`} className="flex items-center gap-2.5 mb-1.5">
                    {s.hostPhoto ? (
                      <img src={s.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ width: 28, height: 28, background: "#222", color: "#aaa" }}>
                        {init}
                      </div>
                    )}
                    <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{s.hostName || "User"}</span>
                  </Link>
                  {s.title && <p className="text-sm" style={{ color: "#888" }}>{s.title}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
