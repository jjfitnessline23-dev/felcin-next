"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export default function PodcastsPage() {
  const { user, loading: authLoading } = useAuth();
  const [followers, setFollowers] = useState<number | null>(null);

  const isOwner = !authLoading && !!user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!user || isOwner) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        setFollowers(snap.data().followersCount ?? 0);
      } else {
        getDoc(doc(db, "users", user.uid)).then((rootSnap) => {
          setFollowers(rootSnap.exists() ? (rootSnap.data().followersCount ?? 0) : 0);
        }).catch(() => setFollowers(0));
      }
    }).catch(() => setFollowers(0));
  }, [user, isOwner]);

  if (authLoading) {
    return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  }

  if (!isOwner) {
    if (followers === null) {
      return <div className="flex justify-center py-32"><div className="spinner" /></div>;
    }
    if (followers < 300) {
      return (
        <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, color: "#555", fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
            style={{ background: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
            300 FOLLOWERS REQUIRED
          </div>
          <h1 className="text-2xl font-bold text-center mb-3" style={{ color: "#f2f2f2" }}>Podcasts</h1>
          <p className="text-sm text-center leading-relaxed" style={{ color: "#555", maxWidth: 280 }}>
            Reach 300 followers to unlock podcasts. You currently have {followers} follower{followers !== 1 ? "s" : ""}.
          </p>
          <div className="mt-6 w-full max-w-xs">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "#555" }}>
              <span>{followers} followers</span>
              <span>300 needed</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (followers / 300) * 100)}%`, background: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.1)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 44, color: "#fff", fontVariationSettings: "'FILL' 1" }}>podcasts</span>
      </div>
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
        style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.15)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
        COMING SOON
      </div>
      <h1 className="text-2xl font-bold text-center mb-3" style={{ color: "#f2f2f2" }}>Podcasts</h1>
      <p className="text-sm text-center leading-relaxed" style={{ color: "#555", maxWidth: 280 }}>
        Audio podcasts from your favorite creators are on the way. Stay tuned!
      </p>
    </div>
  );
}
