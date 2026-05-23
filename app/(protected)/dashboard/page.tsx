"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ posts: 0, likes: 0, comments: 0, followers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, "posts"), where("authorId", "==", user.uid))),
      getDocs(collection(db, "users", user.uid, "followers")),
    ]).then(([postsSnap, followersSnap]) => {
      const posts = postsSnap.docs.map((d) => d.data());
      setStats({
        posts: posts.length,
        likes: posts.reduce((s, p) => s + (p.likes || 0), 0),
        comments: posts.reduce((s, p) => s + (p.comments || 0), 0),
        followers: followersSnap.size,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const cards = [
    { label: "Total Posts", value: stats.posts, icon: "photo_camera", grad: "#1c1c1c", glow: "rgba(255,255,255,0.04)" },
    { label: "Total Likes", value: stats.likes, icon: "favorite", grad: "linear-gradient(135deg,#ef4444,#dc2626)", glow: "rgba(239,68,68,0.2)" },
    { label: "Comments", value: stats.comments, icon: "chat_bubble", grad: "linear-gradient(135deg,#8b5cf6,#6d28d9)", glow: "rgba(139,92,246,0.2)" },
    { label: "Followers", value: stats.followers, icon: "people", grad: "linear-gradient(135deg,#f59e0b,#d97706)", glow: "rgba(245,158,11,0.2)" },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "#555" }}>Your creator stats at a glance</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="p-5 rounded-2xl relative overflow-hidden"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              {/* Glow */}
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                style={{ background: card.glow, transform: "translate(30%, -30%)" }} />
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 relative"
                style={{ background: card.grad }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
              </div>
              <div className="text-3xl font-bold mb-1 relative" style={{ color: "#f2f2f2" }}>{card.value.toLocaleString()}</div>
              <div className="text-sm relative" style={{ color: "#555" }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="mt-6 p-5 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#f2f2f2" }}>Engagement rate</p>
          <p className="text-xs mb-3" style={{ color: "#555" }}>
            {stats.posts > 0
              ? `${(((stats.likes + stats.comments) / stats.posts)).toFixed(1)} interactions per post`
              : "Post something to see your engagement rate"}
          </p>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full" style={{
              width: stats.posts > 0 ? `${Math.min(100, ((stats.likes + stats.comments) / (stats.posts * 10)) * 100)}%` : "0%",
              background: "#fff",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
