"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import PageHeader from "@/components/PageHeader";

interface Post { id: string; authorId: string; authorName?: string; authorPhoto?: string; caption?: string; text?: string; mediaUrl?: string; contentType?: string; mimeType?: string; likes?: number; comments?: number; likedBy?: string[]; createdAt?: { seconds: number } | null; }

export default function BookmarksPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "bookmarks"), orderBy("savedAt", "desc"));
    return onSnapshot(q, async (snap) => {
      const fetched = await Promise.all(snap.docs.map(async (d) => {
        try {
          const s = await getDoc(doc(db, "posts", d.id));
          return s.exists() ? { id: s.id, ...(s.data() as Omit<Post, "id">) } : null;
        } catch { return null; }
      }));
      setPosts(fetched.filter(Boolean) as Post[]);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  return (
    <div className="max-w-xl mx-auto pb-6">
      <PageHeader title="Bookmarks" />
      <div className="px-4 pt-4">

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="ghost-bg text-center py-20 rounded-3xl">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>bookmark</span>
          </div>
          <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>Nothing saved yet</p>
          <p className="text-sm" style={{ color: "#555" }}>Tap the bookmark icon on any post to save it here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {posts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      )}
      </div>
    </div>
  );
}
