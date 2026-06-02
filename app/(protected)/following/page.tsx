"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
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
    <div className="max-w-xl mx-auto pb-6">
      <PageHeader title="Connections" />
      <div className="px-4 pt-4">

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["following", "followers"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer capitalize transition-all"
            style={tab === t ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#333" }}>group</span>
          </div>
          <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>No {tab} yet</p>
          <p className="text-sm" style={{ color: "#555" }}>
            {tab === "following" ? "Explore creators to find people to follow." : "Share your profile to get followers."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((u) => {
            const init = (u.displayName || "U").charAt(0).toUpperCase();
            return (
              <Link key={u.uid} href={`/user-profile?uid=${u.uid}`}
                className="flex items-center gap-3 p-3.5 rounded-2xl transition-colors"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 48, height: 48 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center font-bold shrink-0"
                    style={{ width: 48, height: 48, background: "#222", color: "#aaa" }}>
                    {init}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{u.displayName || "User"}</p>
                  {u.bio && <p className="text-xs truncate mt-0.5" style={{ color: "#555" }}>{u.bio}</p>}
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#333" }}>chevron_right</span>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
