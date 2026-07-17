"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { collection, query, where, orderBy, getDocs, limit } from "@/lib/db";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Post { id: string; mediaUrl?: string; caption?: string; contentType?: string; likes?: number; }

export default function TagPage() {
  const params = useParams();
  const name = decodeURIComponent(params.name as string).replace(/^#/, "").toLowerCase();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, "posts"), where("tags", "array-contains", name), orderBy("createdAt", "desc"), limit(60)))
      .then((snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [name]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/search" className="icon-btn" style={{ width: 36, height: 36 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#f2f2f2" }}>#{name}</h1>
          {!loading && <p className="text-sm" style={{ color: "#555" }}>{posts.length} post{posts.length !== 1 ? "s" : ""}</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="ghost-bg text-center py-20 rounded-3xl">
          <span className="material-symbols-outlined" style={{ fontSize: 44, display: "block", marginBottom: 12, color: "#222" }}>tag</span>
          <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>No posts yet</p>
          <p className="text-sm" style={{ color: "#555" }}>Be the first to use #{name}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <Link key={p.id} href={`/comments?postId=${p.id}`}
              className="relative block" style={{ aspectRatio: "1", background: "#131313", overflow: "hidden" }}>
              {p.mediaUrl
                ? <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center p-2 text-xs text-center" style={{ color: "#555" }}>{p.caption?.slice(0, 60)}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
