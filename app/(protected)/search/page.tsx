"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, query, getDocs, limit, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface UserResult { uid: string; displayName?: string; photoURL?: string; followersCount?: number; }
interface PostResult { id: string; mediaUrl?: string; caption?: string; contentType?: string; }

// Module-level cache: users are fetched once per session
let usersCache: UserResult[] | null = null;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"people" | "tags">("people");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingUsers = useRef(false);

  const search = useCallback(async (term: string, activeTab: string) => {
    if (!term.trim()) { setUsers([]); setPosts([]); return; }
    setLoading(true);
    try {
      if (activeTab === "people") {
        // Fetch user list once and cache it for the session
        if (!usersCache && !fetchingUsers.current) {
          fetchingUsers.current = true;
          const snap = await getDocs(query(collection(db, "users"), limit(200)));
          usersCache = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserResult, "uid">) }));
          fetchingUsers.current = false;
        }
        const all = usersCache ?? [];
        const tl = term.toLowerCase();
        setUsers(all.filter((u) => (u.displayName || "").toLowerCase().includes(tl)).slice(0, 20));
      } else {
        const tag = term.replace(/^#/, "").toLowerCase();
        const snap = await getDocs(
          query(collection(db, "posts"), where("tags", "array-contains", tag), orderBy("createdAt", "desc"), limit(30))
        );
        setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostResult, "id">) })));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q, tab), 300);
    return () => clearTimeout(t);
  }, [q, tab, search]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4" style={{ color: "#f2f2f2" }}>Search</h1>

      <div className="relative mb-4">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: 20, color: "#555" }}>search</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder={tab === "people" ? "Search people…" : "Search hashtag…"}
          className="w-full pl-10 pr-10 py-3 rounded-xl outline-none text-sm"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555" }}>close</span>
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["people", "tags"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer"
            style={tab === t ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
            {t === "people" ? "People" : "Hashtags"}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

      {!loading && tab === "people" && (
        <>
          {!q.trim() && (
            <div className="text-center py-16">
              <span className="material-symbols-outlined" style={{ fontSize: 44, display: "block", marginBottom: 12, color: "#222" }}>person_search</span>
              <p className="text-sm" style={{ color: "#555" }}>Search by name to find people</p>
            </div>
          )}
          {q.trim() && users.length === 0 && (
            <div className="text-center py-16" style={{ color: "#555" }}>No users found for &ldquo;{q}&rdquo;</div>
          )}
          <div className="flex flex-col gap-2">
            {users.map((u) => {
              const init = (u.displayName || "U").charAt(0).toUpperCase();
              return (
                <Link key={u.uid} href={`/user-profile?uid=${u.uid}`}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {u.photoURL
                    ? <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 46, height: 46 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: 46, height: 46, background: "#222", color: "#aaa" }}>{init}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{u.displayName || "User"}</p>
                    {u.followersCount !== undefined && (
                      <p className="text-xs" style={{ color: "#555" }}>{u.followersCount.toLocaleString()} followers</p>
                    )}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#333" }}>chevron_right</span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {!loading && tab === "tags" && (
        <>
          {!q.trim() && (
            <div className="text-center py-16">
              <span className="material-symbols-outlined" style={{ fontSize: 44, display: "block", marginBottom: 12, color: "#222" }}>tag</span>
              <p className="text-sm" style={{ color: "#555" }}>Type a hashtag to find posts</p>
            </div>
          )}
          {q.trim() && posts.length === 0 && (
            <div className="text-center py-16" style={{ color: "#555" }}>No posts found for #{q.replace(/^#/, "")}</div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {posts.map((p) => (
              <Link key={p.id} href={`/comments?postId=${p.id}`}
                className="relative block" style={{ aspectRatio: "1", background: "#131313", overflow: "hidden", borderRadius: 4 }}>
                {p.mediaUrl
                  ? <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center p-2 text-xs text-center" style={{ color: "#888" }}>{p.caption?.slice(0, 60)}</div>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
