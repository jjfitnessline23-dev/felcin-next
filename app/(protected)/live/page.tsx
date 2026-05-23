"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Stream { id: string; hostId: string; hostName?: string; hostPhoto?: string; title?: string; viewerCount?: number; startedAt?: { seconds: number }; }

export default function LivePage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "streams"), where("status", "==", "live"), orderBy("startedAt", "desc"));
    return onSnapshot(q, (snap) => {
      setStreams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stream, "id">) })));
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-3 h-3 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.6)", animation: "pulse 1.5s infinite" }} />
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Live Now</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : streams.length === 0 ? (
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
                {/* Thumbnail */}
                <div className="relative" style={{ background: "#0a0a0a", aspectRatio: "16/9" }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#1a1a1a" }}>live_tv</span>
                  </div>
                  {/* Live badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: "#ef4444" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span className="text-xs font-bold text-white tracking-wide">LIVE</span>
                  </div>
                  {/* Viewer count */}
                  {s.viewerCount !== undefined && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full"
                      style={{ background: "rgba(0,0,0,0.7)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fff" }}>visibility</span>
                      <span className="text-xs text-white font-medium">{s.viewerCount}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
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
