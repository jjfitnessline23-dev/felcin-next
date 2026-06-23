"use client";

import { useState, useEffect } from "react";
import { deriveNameFromEmail } from "@/lib/nameUtils";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { auth, db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface Post { id: string; authorId: string; caption?: string; mediaUrl?: string; contentType?: string; status?: string; createdAt?: { seconds: number }; }
interface Reel { id: string; authorId: string; caption?: string; mediaUrl?: string; status?: string; createdAt?: { seconds: number }; }
interface UserRecord { id: string; displayName?: string; email?: string; photoURL?: string; badge?: string; banned?: boolean; createdAt?: { seconds: number }; }
interface Report { id: string; postId?: string; reelId?: string; authorId?: string; reporterId?: string; reason?: string; status?: string; type?: string; createdAt?: { seconds: number }; }
interface GhostWorkout { id: string; hostId: string; hostName?: string; hostPhoto?: string; title: string; description?: string; exercises?: { name: string; duration: number }[]; sessionCount?: number; isPPV?: boolean; price?: number; createdAt?: { seconds: number }; }
interface GhostSession { id: string; userId: string; userName?: string; userPhoto?: string; exercisesCount?: number; totalDurationSecs?: number; completedAt?: { seconds: number }; }
interface AdminWorkoutLog { id: string; userId: string; date?: { seconds: number }; exercises: { name: string; sets: { reps: number; weight: number }[]; equipment?: string }[]; notes?: string; durationMins?: number; }

type Tab = "overview" | "posts" | "reels" | "users" | "reports" | "ghost" | "analytics" | "settings" | "workouts";

interface AnalyticsData {
  totalPageViews: number;
  totalActiveUsers: number;
  todayPageViews: number;
  todayActiveUsers: number;
  yesterdayPageViews: number;
  yesterdayActiveUsers: number;
}

export default function AdminPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [ghosts, setGhosts] = useState<GhostWorkout[]>([]);
  const [ghostSessions, setGhostSessions] = useState<Record<string, GhostSession[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<string | null>(null);
  const [expandedGhost, setExpandedGhost] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [dataLoading, setDataLoading] = useState(false);
  const [badgesEnabled, setBadgesEnabled] = useState<boolean | null>(null);
  const [togglingBadges, setTogglingBadges] = useState(false);
  const [boostEnabled, setBoostEnabled] = useState<boolean | null>(null);
  const [togglingBoost, setTogglingBoost] = useState(false);
  const [adsEnabled, setAdsEnabled] = useState<boolean | null>(null);
  const [togglingAds, setTogglingAds] = useState(false);
  const [advertiseEnabled, setAdvertiseEnabled] = useState<boolean | null>(null);
  const [togglingAdvertise, setTogglingAdvertise] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<AdminWorkoutLog[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [workoutsLoaded, setWorkoutsLoaded] = useState(false);

  const router = useRouter();
  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!isOwner) return;
    setDataLoading(true);

    const unsubs = [
      onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200)),
        (snap) => { setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }))); setDataLoading(false); },
        () => setDataLoading(false)),

      onSnapshot(query(collection(db, "reels"), orderBy("createdAt", "desc"), limit(200)),
        (snap) => setReels(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reel, "id">) }))),
        () => {}),

      onSnapshot(query(collection(db, "users"), limit(500)),
        (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserRecord, "id">) }))),
        () => {}),

      onSnapshot(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200)),
        (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }))),
        () => {}),

      onSnapshot(query(collection(db, "ghostWorkouts"), orderBy("createdAt", "desc"), limit(200)),
        (snap) => setGhosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GhostWorkout, "id">) }))),
        () => {}),
    ];

    // Load feature flags
    getDoc(doc(db, "config", "features"))
      .then((snap) => {
        const data = snap.exists() ? snap.data() : {};
        setBadgesEnabled(data.badgesEnabled ?? true);
        setBoostEnabled(data.boostEnabled ?? true);
        setAdsEnabled(data.adsEnabled ?? true);
        setAdvertiseEnabled(data.advertiseEnabled ?? true);
      })
      .catch(() => { setBadgesEnabled(true); setBoostEnabled(true); setAdsEnabled(true); setAdvertiseEnabled(true); });

    // Load analytics
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    Promise.all([
      getDoc(doc(db, "analytics", "totals")),
      getDoc(doc(db, "analytics", `daily-${today}`)),
      getDoc(doc(db, "analytics", `daily-${yesterday}`)),
    ]).then(([totals, todaySnap, yestSnap]) => {
      const t = totals.exists() ? totals.data() : {};
      const td = todaySnap.exists() ? todaySnap.data() : {};
      const yd = yestSnap.exists() ? yestSnap.data() : {};
      setAnalytics({
        totalPageViews: t.pageViews || 0,
        totalActiveUsers: t.activeUsers || 0,
        todayPageViews: td.pageViews || 0,
        todayActiveUsers: td.activeUsers || 0,
        yesterdayPageViews: yd.pageViews || 0,
        yesterdayActiveUsers: yd.activeUsers || 0,
      });
    }).catch(() => {
      setAnalytics({ totalPageViews: 0, totalActiveUsers: 0, todayPageViews: 0, todayActiveUsers: 0, yesterdayPageViews: 0, yesterdayActiveUsers: 0 });
    });

    setDataLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [isOwner]);

  useEffect(() => {
    if (workoutsLoaded || loadingWorkouts) return;
    if (!user || !OWNER_UIDS.includes(user.uid)) return;
    if (users.length === 0) return;
    setLoadingWorkouts(true);
    Promise.all(
      users.map((u) =>
        getDocs(query(collection(db, "users", u.id, "workoutLogs"), orderBy("date", "desc"), limit(100)))
          .then((snap) => snap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, userId: u.id, date: data.date, exercises: data.exercises || [], notes: data.notes, durationMins: data.durationMins } as AdminWorkoutLog;
          }))
          .catch(() => [] as AdminWorkoutLog[])
      )
    )
    .then((results) => {
      const all = results.flat().sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0));
      setWorkoutLogs(all);
    })
    .finally(() => { setLoadingWorkouts(false); setWorkoutsLoaded(true); });
  }, [users.length]); // eslint-disable-line

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

  const toggleBoost = async () => {
    if (togglingBoost || boostEnabled === null) return;
    setTogglingBoost(true);
    const next = !boostEnabled;
    try {
      await setDoc(doc(db, "config", "features"), { boostEnabled: next }, { merge: true });
      setBoostEnabled(next);
    } catch {}
    setTogglingBoost(false);
  };

  const toggleAds = async () => {
    if (togglingAds || adsEnabled === null) return;
    setTogglingAds(true);
    const next = !adsEnabled;
    try {
      await setDoc(doc(db, "config", "features"), { adsEnabled: next }, { merge: true });
      setAdsEnabled(next);
    } catch {}
    setTogglingAds(false);
  };

  const toggleAdvertise = async () => {
    if (togglingAdvertise || advertiseEnabled === null) return;
    setTogglingAdvertise(true);
    const next = !advertiseEnabled;
    try {
      await setDoc(doc(db, "config", "features"), { advertiseEnabled: next }, { merge: true });
      setAdvertiseEnabled(next);
    } catch {}
    setTogglingAdvertise(false);
  };

  const pendingReports = reports.filter((r) => r.status !== "reviewed");

  const deleteGhost = async (id: string) => {
    if (!confirm("Delete this ghost workout?")) return;
    await deleteDoc(doc(db, "ghostWorkouts", id)).catch(() => {});
    setGhosts((g) => g.filter((x) => x.id !== id));
  };

  const toggleGhostSessions = async (id: string) => {
    if (expandedGhost === id) { setExpandedGhost(null); return; }
    setExpandedGhost(id);
    if (ghostSessions[id]) return;
    setLoadingSessions(id);
    try {
      const snap = await getDocs(query(collection(db, "ghostWorkouts", id, "sessions"), orderBy("completedAt", "desc"), limit(100)));
      setGhostSessions((prev) => ({ ...prev, [id]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GhostSession, "id">) })) }));
    } catch {}
    setLoadingSessions(null);
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "dashboard" },
    { key: "posts", label: "Posts", icon: "image" },
    { key: "reels", label: "Reels", icon: "play_circle" },
    { key: "users", label: "Users", icon: "group" },
    { key: "reports", label: "Reports", icon: "flag" },
    { key: "ghost", label: "Ghost", icon: "sprint" },
    { key: "workouts", label: "Workouts", icon: "fitness_center" },
    { key: "analytics", label: "Analytics", icon: "analytics" },
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
      <div className="max-w-2xl mx-auto px-4 py-6" style={{ paddingTop: "max(24px, env(safe-area-inset-top, 24px) + 16px)" }}>

        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/profile")}
            className="flex items-center gap-1.5 mb-4 border-none cursor-pointer bg-transparent px-0"
            style={{ color: "#666" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
            <span className="text-sm">Back to profile</span>
          </button>
          <div className="flex items-center justify-between">
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
              { label: "Ghost Workouts", value: ghosts.length, icon: "sprint", color: "#fb923c" },
              { label: "Workout Logs", value: workoutsLoaded ? workoutLogs.length : "—", icon: "fitness_center", color: "#34d399" },
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
                    {(u.displayName || deriveNameFromEmail(u.email || "") || u.id).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{u.displayName || deriveNameFromEmail(u.email || "") || "(no name)"}</p>
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
                    <button onClick={() => deleteUser(u.id, u.displayName || deriveNameFromEmail(u.email || "") || u.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>person_remove</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

        ) : tab === "ghost" ? (
          <div className="flex flex-col gap-2">

            {/* Ghost wallpaper banner */}
            <div className="rounded-2xl mb-3 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0c0818 0%, #100c22 60%, #0a0814 100%)", border: "1px solid rgba(109,40,217,0.35)", minHeight: 130 }}>
              <img src="/static/logo-full.svg" alt="" aria-hidden="true"
                style={{ position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)", width: 160, height: 160, opacity: 0.13, pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: -30, right: 30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div className="relative p-5" style={{ zIndex: 1 }}>
                <div className="flex items-center gap-2 mb-2">
                  <img src="/static/logo-nav.svg" alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
                  <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: "#6d28d9" }}>GHOST WORKOUT</span>
                </div>
                <p className="font-bold mb-1" style={{ fontSize: 20, color: "#f3e8ff", letterSpacing: "-0.3px" }}>Train with the Ghost.</p>
                <svg width="90" height="16" viewBox="0 0 90 16" style={{ display: "block", marginBottom: 8 }}>
                  <path d="M 0,8 L 20,8 L 24,5 L 28,8 L 32,8 L 34,11 L 38,1 L 42,12 L 45,8 C 48,8 49,4 52,8 L 90,8"
                    fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: "#c4b5fd" }}>{ghosts.length}</span>
                  <span className="text-xs" style={{ color: "#6b5a8a" }}>workouts</span>
                  <span style={{ color: "#3d2a6e", fontSize: 12 }}>·</span>
                  <span className="text-sm font-bold" style={{ color: "#c4b5fd" }}>{ghosts.reduce((s, g) => s + (g.sessionCount || 0), 0)}</span>
                  <span className="text-xs" style={{ color: "#6b5a8a" }}>total sessions</span>
                </div>
              </div>
            </div>

            <p className="text-xs mb-1" style={{ color: "#444" }}>{ghosts.length} ghost workouts · {ghosts.reduce((s, g) => s + (g.sessionCount || 0), 0)} total sessions</p>
            {ghosts.length === 0 ? (
              <p className="text-center py-10" style={{ color: "#555" }}>No ghost workouts yet</p>
            ) : ghosts.map((g) => {
              const init = (g.hostName || "H").charAt(0).toUpperCase();
              return (
                <div key={g.id} className="p-4 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-start gap-3">
                    {g.hostPhoto
                      ? <img src={g.hostPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
                      : <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>{init}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{g.title}</p>
                        {g.isPPV && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>PPV ${g.price}</span>}
                      </div>
                      <p className="text-xs" style={{ color: "#555" }}>
                        {g.hostName || g.hostId?.slice(0, 8)} · {g.exercises?.length ?? 0} exercises · {g.sessionCount ?? 0} sessions
                        {g.createdAt && ` · ${new Date(g.createdAt.seconds * 1000).toLocaleDateString()}`}
                      </p>
                      {g.description && <p className="text-xs mt-1 truncate" style={{ color: "#444" }}>{g.description}</p>}
                      {g.exercises && g.exercises.length > 0 && (
                        <p className="text-xs mt-1" style={{ color: "#444" }}>
                          {g.exercises.slice(0, 4).map((e) => e.name).join(", ")}{g.exercises.length > 4 ? ` +${g.exercises.length - 4} more` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => toggleGhostSessions(g.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                        style={{ background: expandedGhost === g.id ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.06)", color: expandedGhost === g.id ? "#a78bfa" : "#666" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{expandedGhost === g.id ? "expand_less" : "people"}</span>
                      </button>
                      <button onClick={() => deleteGhost(g.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                        style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Sessions list */}
                  {expandedGhost === g.id && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {loadingSessions === g.id ? (
                        <div className="flex justify-center py-4"><div className="spinner" /></div>
                      ) : !ghostSessions[g.id] || ghostSessions[g.id].length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: "#444" }}>No sessions recorded yet</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: "#444" }}>
                            {ghostSessions[g.id].length} SESSION{ghostSessions[g.id].length !== 1 ? "S" : ""}
                          </p>
                          {ghostSessions[g.id].map((s) => {
                            const mins = s.totalDurationSecs ? Math.round(s.totalDurationSecs / 60) : null;
                            const date = s.completedAt ? new Date(s.completedAt.seconds * 1000) : null;
                            const isYesterday = date ? new Date(Date.now() - 86400000).toDateString() === date.toDateString() : false;
                            const isToday = date ? new Date().toDateString() === date.toDateString() : false;
                            return (
                              <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                                style={{ background: isYesterday || isToday ? "rgba(167,139,250,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isYesterday || isToday ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)"}` }}>
                                {s.userPhoto
                                  ? <img src={s.userPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 28, height: 28 }} />
                                  : <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 28, height: 28, background: "#222", color: "#666" }}>{(s.userName || "?").charAt(0).toUpperCase()}</div>}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate" style={{ color: "#f2f2f2" }}>{s.userName || s.userId.slice(0, 10) + "…"}</p>
                                  <p className="text-[10px]" style={{ color: "#555" }}>
                                    {s.exercisesCount ?? "?"} exercises{mins ? ` · ${mins}m` : ""}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  {date && (
                                    <p className="text-[10px]" style={{ color: isYesterday ? "#a78bfa" : isToday ? "#34d399" : "#444" }}>
                                      {isToday ? "Today" : isYesterday ? "Yesterday" : date.toLocaleDateString()}
                                    </p>
                                  )}
                                  {date && <p className="text-[10px]" style={{ color: "#333" }}>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        ) : tab === "analytics" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs" style={{ color: "#444" }}>Platform traffic — updates as users visit</p>
              <button onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                setAnalytics(null);
                Promise.all([
                  getDoc(doc(db, "analytics", "totals")),
                  getDoc(doc(db, "analytics", `daily-${today}`)),
                  getDoc(doc(db, "analytics", `daily-${yesterday}`)),
                ]).then(([totals, todaySnap, yestSnap]) => {
                  const t = totals.exists() ? totals.data() : {};
                  const td = todaySnap.exists() ? todaySnap.data() : {};
                  const yd = yestSnap.exists() ? yestSnap.data() : {};
                  setAnalytics({ totalPageViews: t.pageViews || 0, totalActiveUsers: t.activeUsers || 0, todayPageViews: td.pageViews || 0, todayActiveUsers: td.activeUsers || 0, yesterdayPageViews: yd.pageViews || 0, yesterdayActiveUsers: yd.activeUsers || 0 });
                }).catch(() => setAnalytics({ totalPageViews: 0, totalActiveUsers: 0, todayPageViews: 0, todayActiveUsers: 0, yesterdayPageViews: 0, yesterdayActiveUsers: 0 }));
              }} className="flex items-center gap-1 border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                <span className="text-xs">Refresh</span>
              </button>
            </div>

            {/* Today vs Yesterday */}
            <div className="p-4 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-semibold mb-3" style={{ color: "#555" }}>TODAY</p>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#f2f2f2" }}>{analytics?.todayPageViews ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Page views</p>
                </div>
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#a78bfa" }}>{analytics?.todayActiveUsers ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Active users</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-semibold mb-3" style={{ color: "#555" }}>YESTERDAY</p>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#f2f2f2" }}>{analytics?.yesterdayPageViews ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Page views</p>
                </div>
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#a78bfa" }}>{analytics?.yesterdayActiveUsers ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Active users</p>
                </div>
              </div>
            </div>

            {/* All time */}
            <div className="p-4 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-semibold mb-3" style={{ color: "#555" }}>ALL TIME</p>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#f2f2f2" }}>{analytics?.totalPageViews ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Total page views</p>
                </div>
                <div className="flex-1">
                  <p className="text-3xl font-bold" style={{ color: "#34d399" }}>{analytics?.totalActiveUsers ?? "—"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>Total users visited</p>
                </div>
              </div>
            </div>
          </div>

        ) : tab === "workouts" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: "#444" }}>All users' workout logs</p>
              <button
                onClick={() => { setWorkoutsLoaded(false); setWorkoutLogs([]); }}
                disabled={loadingWorkouts}
                className="flex items-center gap-1 border-none bg-transparent cursor-pointer"
                style={{ color: "#555" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                <span className="text-xs">Refresh</span>
              </button>
            </div>
            {workoutsLoaded && workoutLogs.length > 0 && (() => {
              const uniqueUsers = new Set(workoutLogs.map((l) => l.userId)).size;
              const totalMins = workoutLogs.reduce((s, l) => s + (l.durationMins || 0), 0);
              const exFreq: Record<string, number> = {};
              workoutLogs.forEach((l) => l.exercises.forEach((e) => { if (e.name) exFreq[e.name] = (exFreq[e.name] || 0) + 1; }));
              const topEx = Object.entries(exFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-xl text-center" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xl font-bold" style={{ color: "#34d399" }}>{workoutLogs.length}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#555" }}>Total logs</p>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xl font-bold" style={{ color: "#60a5fa" }}>{uniqueUsers}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#555" }}>Active users</p>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xl font-bold" style={{ color: "#a78bfa" }}>{totalMins.toLocaleString()}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#555" }}>Total mins</p>
                    </div>
                  </div>
                  {topEx.length > 0 && (
                    <div className="p-3 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#444" }}>TOP EXERCISES</p>
                      <div className="flex flex-col gap-1">
                        {topEx.map(([name, count]) => (
                          <div key={name} className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: "#f2f2f2" }}>{name}</span>
                            <span className="text-xs font-semibold" style={{ color: "#555" }}>{count}×</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {loadingWorkouts ? (
              <div className="flex justify-center py-10"><div className="spinner" /></div>
            ) : workoutLogs.length === 0 ? (
              <p className="text-center py-10" style={{ color: "#555" }}>No workout logs yet</p>
            ) : (
              <>
                <p className="text-xs" style={{ color: "#444" }}>{workoutLogs.length} logs · most recent first</p>
                {workoutLogs.map((log) => {
                  const userRecord = users.find((u) => u.id === log.userId);
                  const userName = userRecord?.displayName || (log.userId.slice(0, 10) + "…");
                  const userPhoto = userRecord?.photoURL;
                  const totalVol = log.exercises.reduce((s, ex) => s + ex.sets.reduce((s2, set) => s2 + set.reps * set.weight, 0), 0);
                  return (
                    <div key={log.id} className="p-4 rounded-xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center gap-2.5 mb-3">
                        {userPhoto
                          ? <img src={userPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
                          : <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 32, height: 32, background: "#222", color: "#666" }}>{userName.charAt(0).toUpperCase()}</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{userName}</p>
                          <p className="text-xs" style={{ color: "#555" }}>
                            {log.date ? new Date(log.date.seconds * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Today"}
                            {log.durationMins ? ` · ${log.durationMins}m` : ""}
                            {totalVol > 0 ? ` · ${Math.round(totalVol).toLocaleString()}kg vol` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {log.exercises.map((ex, i) => (
                          <div key={i} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                              {ex.equipment && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}>{ex.equipment}</span>}
                            </div>
                            <p className="text-xs break-words" style={{ color: "#555" }}>
                              {ex.sets.length}× {ex.sets.map((s) => `${s.reps}${s.weight > 0 ? `@${s.weight}kg` : ""}`).join(", ")}
                            </p>
                          </div>
                        ))}
                      </div>
                      {log.notes && <p className="text-xs mt-2 italic" style={{ color: "#444" }}>{log.notes}</p>}
                    </div>
                  );
                })}
              </>
            )}
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

            {/* Boost toggle */}
            <div className="flex items-center gap-4 p-5 rounded-2xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: boostEnabled ? "rgba(99,91,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${boostEnabled ? "rgba(99,91,255,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: boostEnabled ? "#635bff" : "#444", fontVariationSettings: "'FILL' 1" }}>
                  rocket_launch
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Post Boost</p>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                  {boostEnabled ? "Creators can boost posts for $5 / $10 / $15" : "Hidden — Boost button not shown to creators"}
                </p>
              </div>
              <button
                onClick={toggleBoost}
                disabled={togglingBoost || boostEnabled === null}
                className="relative inline-block shrink-0 cursor-pointer border-none bg-transparent"
                style={{ width: 44, height: 24 }}>
                <span className="absolute inset-0 rounded-full transition-colors duration-200"
                  style={{ background: boostEnabled ? "#635bff" : "#2a2a2a" }} />
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: boostEnabled ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            {/* Ads toggle */}
            <div className="flex items-center gap-4 p-5 rounded-2xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: adsEnabled ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${adsEnabled ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: adsEnabled ? "#fbbf24" : "#444", fontVariationSettings: "'FILL' 1" }}>
                  campaign
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Ads in Feed</p>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                  {adsEnabled ? "Active ads are shown in the feed" : "Hidden — no ads shown to any user"}
                </p>
              </div>
              <button
                onClick={toggleAds}
                disabled={togglingAds || adsEnabled === null}
                className="relative inline-block shrink-0 cursor-pointer border-none bg-transparent"
                style={{ width: 44, height: 24 }}>
                <span className="absolute inset-0 rounded-full transition-colors duration-200"
                  style={{ background: adsEnabled ? "#fbbf24" : "#2a2a2a" }} />
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: adsEnabled ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            {/* Advertise toggle */}
            <div className="flex items-center gap-4 p-5 rounded-2xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: advertiseEnabled ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${advertiseEnabled ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: advertiseEnabled ? "#60a5fa" : "#444", fontVariationSettings: "'FILL' 1" }}>
                  ads_click
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Advertise</p>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                  {advertiseEnabled ? "Users can create and run ads on Felcin" : "Hidden — Advertise option not shown to users"}
                </p>
              </div>
              <button
                onClick={toggleAdvertise}
                disabled={togglingAdvertise || advertiseEnabled === null}
                className="relative inline-block shrink-0 cursor-pointer border-none bg-transparent"
                style={{ width: 44, height: 24 }}>
                <span className="absolute inset-0 rounded-full transition-colors duration-200"
                  style={{ background: advertiseEnabled ? "#60a5fa" : "#2a2a2a" }} />
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: advertiseEnabled ? "translateX(20px)" : "translateX(0)" }} />
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
