"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Post { id: string; mediaUrl?: string; contentType?: string; mimeType?: string; thumbnailUrl?: string; }
interface FUser { _uid: string; displayName: string; photoURL: string; }

function resolveMediaType(contentType?: string, mimeType?: string, url?: string) {
  const t = contentType || mimeType || "";
  if (t === "video" || t.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(url || "")) return "video";
  return "image";
}

export default function ExplorePage() {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [cachedUsers, setCachedUsers] = useState<FUser[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FUser[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(60))).then((snap) => {
      setAllPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })).filter((p) => p.mediaUrl));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q) { setSearchResults(null); return; }
    try {
      let users = cachedUsers;
      if (!users) {
        const snap = await getDocs(query(collection(db, "users"), limit(200)));
        users = snap.docs.map((d) => {
          const data = d.data();
          return { _uid: d.id, displayName: data.displayName || data.username || "", photoURL: data.photoURL || "" };
        });
        setCachedUsers(users);
      }
      setSearchResults(users.filter((u) => u.displayName.toLowerCase().includes(q.toLowerCase())).slice(0, 12));
    } catch {
      setSearchResults([]);
    }
  }, [cachedUsers]);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(search), 250);
    return () => clearTimeout(t);
  }, [search, handleSearch]);

  const filtered = allPosts.filter((p) => {
    if (filter === "image") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "image";
    if (filter === "video") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "video";
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto pb-8">
      {/* Sticky header */}
      <div className="sticky z-10 px-4 py-3" style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold shrink-0" style={{ color: "#f2f2f2" }}>Explore</h1>
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: 18, color: "#444" }}>search</span>
            <input
              type="text"
              placeholder="Search creators…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }}
            />
          </div>
        </div>

        {/* Filter pills */}
        {!search && (
          <div className="flex gap-2 mt-2.5">
            {[["all", "All"], ["image", "Photos"], ["video", "Videos"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`btn-pill${filter === val ? " is-active" : ""}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-0">
        {loading ? (
          <div className="flex justify-center py-20"><div className="spinner" /></div>
        ) : searchResults !== null ? (
          /* Creator search results */
          <div className="p-4">
            {searchResults.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#222", display: "block", marginBottom: 10 }}>person_search</span>
                <p style={{ color: "#555" }}>No creators found</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {searchResults.map((u) => (
                  <Link key={u._uid} href={`/user-profile?uid=${u._uid}`}
                    className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 48, height: 48 }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center font-bold text-lg shrink-0"
                        style={{ width: 48, height: 48, background: "#222", color: "#aaa" }}>
                        {(u.displayName || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{u.displayName}</span>
                    <span className="ml-auto material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>chevron_right</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Media grid */
          filtered.length === 0 ? (
            <div className="text-center py-20">
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#222", display: "block", marginBottom: 10 }}>photo_library</span>
              <p style={{ color: "#555" }}>No content yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3" style={{ gap: 2 }}>
              {filtered.map((post) => {
                const type = resolveMediaType(post.contentType, post.mimeType, post.mediaUrl);
                return (
                  <Link key={post.id} href={`/comments?postId=${post.id}`}
                    className="relative block" style={{ aspectRatio: "1", overflow: "hidden", background: "#0f0f0f" }}>
                    {type === "video" ? (
                      post.thumbnailUrl
                        ? <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: "#111" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>play_circle</span>
                          </div>
                    ) : (
                      <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {type === "video" && (
                      <span className="material-symbols-outlined absolute top-2 right-2 text-white" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
