"use client";

import { useState, useEffect } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface Post { id: string; authorId: string; caption?: string; mediaUrl?: string; contentType?: string; status?: string; createdAt?: { seconds: number }; }
interface Reel { id: string; authorId: string; caption?: string; mediaUrl?: string; status?: string; createdAt?: { seconds: number }; }
interface UserRecord { id: string; displayName?: string; email?: string; photoURL?: string; badge?: string; banned?: boolean; createdAt?: { seconds: number }; }
interface Report { id: string; postId?: string; reelId?: string; authorId?: string; reporterId?: string; reason?: string; status?: string; type?: string; createdAt?: { seconds: number }; }

type Tab = "overview" | "posts" | "reels" | "users" | "reports" | "settings";

export default function AdminPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [dataLoading, setDataLoading] = useState(false);
  const [badgesEnabled, setBadgesEnabled] = useState<boolean | null>(null);
  const [togglingBadges, setTogglingBadges] = useState(false);

  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!isOwner) return;
    setDataLoading(true);

    getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)))
      .then((snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }))))
      .catch(() => {});

    getDocs(query(collection(db, "reels"), orderBy("createdAt", "desc"), limit(100)))
      .then((snap) => setReels(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reel, "id">) }))))
      .catch(() => {});

    getDocs(query(collection(db, "users"), limit(200)))
      .then((snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserRecord, "id">) }))))
      .catch(() => {});

    getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200)))
      .then((snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }))))
      .catch(() => {});

    getDoc(doc(db, "config", "features"))
      .then((snap) => setBadgesEnabled(snap.exists() ? (snap.data().badgesEnabled ?? true) : true))
      .catch(() => setBadgesEnabled(true));

    setDataLoading(false);
  }, [isOwner]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setAuthError("Sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => signOut(auth).catch(() => {});

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await deleteDoc(doc(db, "posts", id)).catch(() => {});
    setPosts((p) => p.filter((x) => x.id !== id));
  };

  const deleteReel = async (id: string) => {
    if (!confirm("Delete this reel?")) return;
    await deleteDoc(doc(db, "reels", id)).catch(() => {});
    setReels((r) => r.filter((x) => x.id !== id));
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This removes their profile data.`)) return;
    await deleteDoc(doc(db, "users", id)).catch(() => {});
    await deleteDoc(doc(db, "users", id, "public", "profile")).catch(() => {});
    setUsers((u) => u.filter((x) => x.id !== id));
  };

  const toggleBan = async (id: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? "Unban" : "Ban";
    if (!confirm(`${action} this user?`)) return;
    await updateDoc(doc(db, "users", id), { banned: !currentlyBanned }).catch(() => {});
    setUsers((u) => u.map((x) => x.id === id ? { ...x, banned: !currentlyBanned } : x));
  };

  const toggleBadges = async () => {
    if (togglingBadges || badgesEnabled === null) return;
    setTogglingBadges(true);
    const next = !badgesEnabled;
    try {
      await setDoc(doc(db, "config", "features"), { badgesEnabled: next }, { merge: true });
      setBadgesEnabled(next);
    } catch {}
    setTogglingBadges(false);
  };

  const pendingReports = reports.filter((r) => r.status !== "reviewed");

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "dashboard" },
    { key: "posts", label: "Posts", icon: "image" },
    { key: "reels", label: "Reels", icon: "play_circle" },
    { key: "users", label: "Users", icon: "group" },
    { key: "reports", label: "Reports", icon: "flag" },
    { key: "settings", label: "Settings", icon: "settings" },
  ];

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#090909" }}>
        <div className="spinner" />
      </div>
    );
  }

  // ── Not signed in ──
  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "#090909" }}>
        <div className="w-full max-w-sm">
          {/* Logo / brand */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>
                admin_panel_settings
              </span>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Admin Portal</h1>
            <p className="text-sm mt-1" style={{ color: "#555" }}>felcin.com — restricted access</p>
          </div>

          {/* Sign-in card */}
          <div className="rounded-2xl p-6" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-sm mb-5 text-center" style={{ color: "#888" }}>
              Sign in with your admin Google account to continue
            </p>

            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold text-sm border-none cursor-pointer transition-opacity"
              style={{ background: "#fff", color: "#111", opacity: signingIn ? 0.6 : 1 }}>
              {signingIn ? (
                <span style={{ fontSize: 13 }}>Signing in…</span>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {authError && (
              <p className="text-xs text-center mt-3" style={{ color: "#f87171" }}>{authError}</p>
            )}
          </div>

          <p className="text-xs text-center mt-5" style={{ color: "#333" }}>
            This page is not indexed by search engines
          </p>
        </div>
      </div>
    );
  }

  // ── Signed in but not owner ──
  if (!isOwner) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "#090909" }}>
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#ef4444" }}>lock</span>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#f2f2f2" }}>Access Denied</h2>
          <p className="text-sm mb-1" style={{ color: "#555" }}>
            Signed in as <span style={{ color: "#888" }}>{user.email}</span>
          </p>
          <p className="text-sm mb-6" style={{ color: "#444" }}>This account does not have admin access.</p>
          <button
            onClick={handleSignOut}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ──
  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ef4444" }}>admin_panel_settings</span>
              <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Admin Panel</h1>
            </div>
            <p className="text-xs" style={{ color: "#444" }}>
              Signed in as {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", color: "#666" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>logout</span>
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 overflow-x-auto" style={{ background: "rgba(255,255,255,0.04)" }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer whitespace-nowrap transition-all shrink-0"
              style={tab === t.key ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
              {t.key === "reports" && pendingReports.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: tab === "reports" ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.2)", color: "#f87171" }}>
                  {pendingReports.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <div className="flex justify-center py-10"><div className="spinner" /></div>
        ) : tab === "overview" ? (
          <div className="flex flex-col gap-3">
            {[
              { label: "Total Posts", value: posts.length, icon: "image", color: "#60a5fa" },
              { label: "Total Reels", value: reels.length, icon: "play_circle", color: "#a78bfa" },
              { label: "Total Users", value: users.length, icon: "group", color: "#34d399" },
              { label: "Pending Reports", value: pendingReports.length, icon: "flag", color: "#f87171" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: stat.color }}>{stat.icon}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>{stat.value}</p>
                  <p className="text-xs" style={{ color: "#555" }}>{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

        ) : tab === "posts" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs mb-1" style={{ color: "#444" }}>{posts.length} posts</p>
            {posts.length === 0 ? (
              <p className="text-center py-10" style={{ color: "#555" }}>No posts</p>
            ) : posts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                {p.mediaUrl ? (
                  p.contentType?.startsWith("video") ? (
                    <div className="rounded-lg shrink-0 flex items-center justify-center"
                      style={{ width: 48, height: 48, background: "#1a1a1a" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555" }}>play_circle</span>
                    </div>
                  ) : (
                    <img src={p.mediaUrl} alt="" className="rounded-lg object-cover shrink-0" style={{ width: 48, height: 48 }} />
                  )
                ) : (
                  <div className="rounded-lg flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: "#1a1a1a" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#333" }}>image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "#f2f2f2" }}>{p.caption || "(no caption)"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#444" }}>
                    {p.authorId.slice(0, 8)}… · <span style={{ color: "#666" }}>{p.status || "published"}</span>
                    {p.createdAt && ` · ${new Date(p.createdAt.seconds * 1000).toLocaleDateString()}`}
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

        ) : tab === "reels" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs mb-1" style={{ color: "#444" }}>{reels.length} reels</p>
            {reels.length === 0 ? (
              <p className="text-center py-10" style={{ color: "#555" }}>No reels</p>
            ) : reels.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="rounded-lg shrink-0 flex items-center justify-center"
                  style={{ width: 48, height: 48, background: "#1a1a1a" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555" }}>play_circle</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "#f2f2f2" }}>{r.caption || "(no caption)"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#444" }}>
                    {r.authorId.slice(0, 8)}…
                    {r.createdAt && ` · ${new Date(r.createdAt.seconds * 1000).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => deleteReel(r.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer shrink-0"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                </button>
              </div>
            ))}
          </div>

        ) : tab === "users" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs mb-1" style={{ color: "#444" }}>{users.length} users</p>
            {users.length === 0 ? (
              <p className="text-center py-10" style={{ color: "#555" }}>No users</p>
            ) : users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "#131313", border: `1px solid ${u.banned ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`, opacity: u.banned ? 0.75 : 1 }}>
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 40, height: 40 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ width: 40, height: 40, background: "#222", color: "#666" }}>
                    {(u.displayName || u.id).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{u.displayName || "(no name)"}</p>
                    {u.badge && <span className="text-xs">{u.badge}</span>}
                    {OWNER_UIDS.includes(u.id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>OWNER</span>
                    )}
                    {u.banned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>BANNED</span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: "#444" }}>{u.id.slice(0, 12)}…</p>
                </div>
                {!OWNER_UIDS.includes(u.id) && (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => toggleBan(u.id, !!u.banned)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                      style={{ background: u.banned ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)", color: u.banned ? "#34d399" : "#f87171" }}
                      title={u.banned ? "Unban user" : "Ban user"}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{u.banned ? "lock_open" : "block"}</span>
                    </button>
                    <button onClick={() => deleteUser(u.id, u.displayName || u.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>person_remove</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

        ) : tab === "settings" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs mb-1" style={{ color: "#444" }}>Feature toggles — changes take effect immediately for all users</p>
            <div className="flex items-center gap-4 p-5 rounded-2xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: badgesEnabled ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${badgesEnabled ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: badgesEnabled ? "#a78bfa" : "#444", fontVariationSettings: "'FILL' 1" }}>
                  workspace_premium
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Creator Badges</p>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                  {badgesEnabled ? "Visible to all users on the Badges page" : "Hidden — users cannot see or purchase badges"}
                </p>
              </div>
              <button
                onClick={toggleBadges}
                disabled={togglingBadges || badgesEnabled === null}
                className="relative inline-block shrink-0 cursor-pointer border-none bg-transparent"
                style={{ width: 44, height: 24 }}>
                <span className="absolute inset-0 rounded-full transition-colors duration-200"
                  style={{ background: badgesEnabled ? "#a78bfa" : "#2a2a2a" }} />
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: badgesEnabled ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
          </div>

        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: "#333" }}>flag</span>
            </div>
            <p style={{ color: "#555" }}>No reports yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs mb-1" style={{ color: "#444" }}>
              {pendingReports.length} pending · {reports.length} total
            </p>
            {reports.map((r) => (
              <div key={r.id} className="p-4 rounded-xl"
                style={{ background: "#131313", border: `1px solid ${r.status === "reviewed" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.07)"}`, opacity: r.status === "reviewed" ? 0.5 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#f87171" }}>flag</span>
                      <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{r.reason || "No reason given"}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: r.status === "reviewed" ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.1)", color: r.status === "reviewed" ? "#555" : "#f87171" }}>
                        {r.status || "pending"}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "#444" }}>
                      {r.postId && <>Post: <span style={{ color: "#666" }}>{r.postId.slice(0, 12)}…</span>{" · "}</>}
                      {r.reelId && <>Reel: <span style={{ color: "#666" }}>{r.reelId.slice(0, 12)}…</span>{" · "}</>}
                      Reporter: <span style={{ color: "#666" }}>{r.reporterId?.slice(0, 8)}…</span>
                      {r.createdAt && <> · {new Date(r.createdAt.seconds * 1000).toLocaleDateString()}</>}
                    </p>
                  </div>
                  {r.status !== "reviewed" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={async () => {
                          const col = r.reelId ? "reels" : "posts";
                          const contentId = r.reelId || r.postId;
                          if (contentId) await deleteDoc(doc(db, col, contentId)).catch(() => {});
                          await updateDoc(doc(db, "reports", r.id), { status: "reviewed" }).catch(() => {});
                          setReports((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "reviewed" } : x));
                          if (r.postId) setPosts((p) => p.filter((x) => x.id !== r.postId));
                          if (r.reelId) setReels((rl) => rl.filter((x) => x.id !== r.reelId));
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer font-semibold"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                        Delete
                      </button>
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, "reports", r.id), { status: "reviewed" }).catch(() => {});
                          setReports((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "reviewed" } : x));
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer font-semibold"
                        style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
