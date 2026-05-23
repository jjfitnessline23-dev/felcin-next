"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface Post { id: string; authorId: string; caption?: string; mediaUrl?: string; contentType?: string; status?: string; createdAt?: { seconds: number }; }

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<"posts" | "reports">("posts");
  const [loading, setLoading] = useState(true);

  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!isOwner) { router.replace("/"); return; }
    getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50))).then((snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
      setLoading(false);
    });
  }, [isOwner, router]);

  if (!isOwner) return null;

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await deleteDoc(doc(db, "posts", id));
    setPosts((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ef4444" }}>admin_panel_settings</span>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Admin Panel</h1>
        </div>
        <p className="text-xs" style={{ color: "#444" }}>Owner access only</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["posts", "reports"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer capitalize transition-all"
            style={tab === t ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="spinner" /></div>
      ) : tab === "posts" ? (
        <div className="flex flex-col gap-2">
          {posts.length === 0 ? (
            <p className="text-center py-10" style={{ color: "#555" }}>No posts</p>
          ) : posts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              {p.mediaUrl ? (
                <img src={p.mediaUrl} alt="" className="rounded-lg object-cover shrink-0" style={{ width: 48, height: 48 }} />
              ) : (
                <div className="rounded-lg flex items-center justify-center shrink-0"
                  style={{ width: 48, height: 48, background: "#1a1a1a" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#333" }}>image</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "#f2f2f2" }}>{p.caption || "(no caption)"}</p>
                <p className="text-xs mt-0.5" style={{ color: "#444" }}>
                  {p.authorId.slice(0, 8)}… · <span style={{ color: p.status === "published" ? "#f2f2f2" : "#888" }}>{p.status || "published"}</span>
                </p>
              </div>
              <button onClick={() => deletePost(p.id)}
                className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer shrink-0"
                style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: "#333" }}>flag</span>
          </div>
          <p style={{ color: "#555" }}>No reports yet</p>
        </div>
      )}
    </div>
  );
}
