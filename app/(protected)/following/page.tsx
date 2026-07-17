"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, getDoc } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface FollowUser { uid: string; displayName?: string; photoURL?: string; bio?: string; }

export default function FollowingPage() {
  const { user } = useAuth();
  const [list, setList] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"following" | "followers">("following");
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(collection(db, "users", user.uid, "following"), (s) => setFollowingCount(s.size));
    const unsub2 = onSnapshot(collection(db, "users", user.uid, "followers"), (s) => setFollowersCount(s.size));
    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const colPath = tab === "following"
      ? collection(db, "users", user.uid, "following")
      : collection(db, "users", user.uid, "followers");
    return onSnapshot(colPath, async (snap) => {
      try {
        const uids = snap.docs.map((d) => tab === "following" ? d.data().followingId || d.id : d.data().followerId || d.id);
        const users = await Promise.all(uids.map(async (uid) => {
          try {
            const pub = await getDoc(doc(db, "users", uid, "public", "profile"));
            if (pub.exists()) { const d = pub.data(); return { uid, displayName: d.displayName || d.username || "User", photoURL: d.photoURL || "", bio: d.bio || "" }; }
            const root = await getDoc(doc(db, "users", uid));
            if (root.exists()) { const d = root.data(); return { uid, displayName: d.displayName || d.username || "User", photoURL: d.photoURL || "", bio: d.bio || "" }; }
          } catch {}
          return { uid };
        }));
        setList(users);
      } catch {}
      setLoading(false);
    }, () => setLoading(false));
  }, [user, tab]);

  return (
    <div className="max-w-xl mx-auto pb-10 overflow-x-hidden">
      <PageHeader title="Connections" />

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#061a1f 0%,#0a2530 50%,#061a1f 100%)", border: "1px solid rgba(6,182,212,0.22)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(6,182,212,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(6,182,212,0.18) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#06b6d4", fontVariationSettings: "'FILL' 1" }}>group</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#06b6d4", letterSpacing: "0.18em" }}>CONNECTIONS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#67e8f9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Your Network</h1>
          <p className="text-sm mb-3" style={{ color: "#555" }}>People you follow and who follow you</p>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-base font-black" style={{ color: "#06b6d4" }}>{followingCount}</span>
              <span className="text-xs ml-1.5" style={{ color: "#555" }}>following</span>
            </div>
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
            <div>
              <span className="text-base font-black" style={{ color: "#06b6d4" }}>{followersCount}</span>
              <span className="text-xs ml-1.5" style={{ color: "#555" }}>followers</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex mx-4 mb-4 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["following", "followers"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer capitalize"
            style={{ background: tab === t ? "#06b6d4" : "transparent", color: tab === t ? "#000" : "#555" }}>
            {t === "following" ? `Following · ${followingCount}` : `Followers · ${followersCount}`}
          </button>
        ))}
      </div>

      <div className="px-4">
        {loading ? (
          <div className="ghost-bg flex justify-center py-24 rounded-3xl"><div className="spinner" /></div>
        ) : list.length === 0 ? (
          <div className="ghost-bg text-center py-20 rounded-3xl">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#06b6d4", fontVariationSettings: "'FILL' 1" }}>group</span>
            </div>
            <p className="font-bold mb-1" style={{ color: "#f2f2f2" }}>No {tab} yet</p>
            <p className="text-sm" style={{ color: "#555" }}>
              {tab === "following" ? "Explore creators to find people to follow." : "Share your profile to get followers."}
            </p>
            {tab === "following" && (
              <Link href="/explore"
                className="inline-flex items-center gap-2 mt-5 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg,#0891b2,#06b6d4)", color: "#fff", boxShadow: "0 0 20px rgba(6,182,212,0.35)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>explore</span>
                Explore Creators
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((u, i) => {
              const init = (u.displayName || "U").charAt(0).toUpperCase();
              return (
                <Link key={u.uid} href={`/user-profile?uid=${u.uid}`}
                  className="flex items-center gap-3 p-3.5 rounded-2xl transition-all"
                  style={{ background: "#0d1f23", border: "1px solid rgba(6,182,212,0.12)", animation: `slideUp 0.3s ease ${i * 0.04}s both` }}>
                  <div className="relative shrink-0">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="rounded-full object-cover" style={{ width: 48, height: 48, border: "2px solid rgba(6,182,212,0.3)" }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ width: 48, height: 48, background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "2px solid rgba(6,182,212,0.25)" }}>
                        {init}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{u.displayName || "User"}</p>
                    {u.bio && <p className="text-xs truncate mt-0.5" style={{ color: "#555" }}>{u.bio}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}>
                      View
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
