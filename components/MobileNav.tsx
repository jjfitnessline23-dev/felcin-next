"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAuth } from "@/lib/auth";
import { OWNER_UIDS, db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/db";

const quickActions = [
  { href: "/notifications", icon: "notifications", label: "Notifications", badge: true },
  { href: "/private-chats", icon: "chat", label: "Messages" },
  { href: "/following", icon: "group", label: "Connections" },
  { href: "/bookmarks", icon: "bookmark", label: "Bookmarks" },
];

const moreGroups = [
  {
    label: "Content",
    items: [
      { href: "/reels", icon: "play_circle", label: "Reels" },
      { href: "/live", icon: "live_tv", label: "Live Studio" },
      { href: "/stories", icon: "auto_stories", label: "Stories" },
      { href: "/podcasts", icon: "mic", label: "Podcast Studio" },
    ],
  },
  {
    label: "Fitness",
    items: [
      { href: "/workouts", icon: "fitness_center", label: "Workout Log" },
      { href: "/trainers", icon: "sports_martial_arts", label: "Find Trainer" },
      { href: "/training-sessions", icon: "event_available", label: "My Sessions" },
      { href: "/schedule", icon: "calendar_month", label: "Schedule" },
      { href: "/challenges", icon: "link", label: "Challenges" },
    ],
  },
  {
    label: "Fitness Tools",
    items: [
      { href: "/progress", icon: "compare", label: "Progress Photos" },
      { href: "/muscle-map", icon: "accessibility_new", label: "Muscle Map" },
      { href: "/recovery", icon: "monitor_heart", label: "Recovery" },
      { href: "/nemesis", icon: "sports_mma", label: "Nemesis" },
      { href: "/capsule", icon: "lock_clock", label: "Time Capsule" },
      { href: "/will", icon: "history_edu", label: "Fitness Will" },
    ],
  },
  {
    label: "Creator Studio",
    items: [
      { href: "/creator", icon: "add_circle", label: "Create Content" },
      { href: "/dashboard", icon: "bar_chart", label: "Dashboard" },
      { href: "/earnings", icon: "payments", label: "Earnings" },
      { href: "/badges", icon: "verified", label: "Badges" },
      { href: "/trainer-dashboard", icon: "school", label: "Trainer Hub" },
    ],
  },
];

const moreItems = [...quickActions, ...moreGroups.flatMap((g) => g.items)];

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const unread = useUnreadCount();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const [advertiseEnabled, setAdvertiseEnabled] = useState(true);
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Profile";

  useEffect(() => {
    return onSnapshot(doc(db, "config", "features"), (snap) => {
      if (snap.exists()) setAdvertiseEnabled(snap.data().advertiseEnabled ?? true);
    });
  }, []);

  const photoURL = user?.photoURL;
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Re-open drawer when user navigates back to the "menu open" history state
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (e.state?.drawerOpen) setOpen(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleSignOut = async () => { setOpen(false); await signOut(); router.push("/login"); };

  if (pathname.startsWith("/comments") || pathname.startsWith("/private-chats")) return null;

  const profileActive = pathname.startsWith("/profile") || pathname.startsWith("/profile-settings");
  const moreActive = moreItems.some((i) => pathname.startsWith(i.href));
  const isGhostPath = pathname.startsWith("/ghost");
  const isExplorePath = pathname.startsWith("/explore") || pathname.startsWith("/search");
  const isRunPath = pathname.startsWith("/run");

  const tabs = [
    { href: "/", icon: "home", label: "Home", active: pathname === "/", accent: false, run: false },
    { href: "/ghost", icon: "sprint", label: "Workout", active: isGhostPath, accent: true, run: false },
    { href: "/run", icon: "directions_run", label: "Run", active: isRunPath, accent: false, run: true },
    { href: "/explore", icon: "explore", label: "Explore", active: isExplorePath, accent: false, run: false },
  ];

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="mobile-nav-bar fixed bottom-0 left-0 right-0 z-50 items-stretch"
        style={{
          background: "rgba(9,9,9,0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>

        {tabs.map((tab) => {
          const activeColor = tab.run ? "#22c55e" : tab.accent ? "#a78bfa" : "#fff";
          const inactiveColor = tab.run ? "#2a5c3a" : tab.accent ? "#6d51c4" : "#555";
          return (
            <Link key={tab.href} href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              style={{ color: tab.active ? activeColor : inactiveColor }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 24,
                fontVariationSettings: tab.active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
              }}>{tab.icon}</span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}

        <button onClick={() => { setOpen(true); window.history.pushState({ drawerOpen: true }, ""); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 border-none bg-transparent cursor-pointer relative">
          <div className="relative">
            {photoURL ? (
              <img src={photoURL} alt="" className="rounded-full object-cover"
                style={{ width: 26, height: 26, border: `2px solid ${open || moreActive || profileActive ? "#fff" : "rgba(255,255,255,0.25)"}` }} />
            ) : (
              <div className="rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ width: 26, height: 26, background: "#2a2a2a", color: "#aaa", border: `2px solid ${open || moreActive || profileActive ? "#fff" : "rgba(255,255,255,0.2)"}` }}>
                {initial}
              </div>
            )}
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7px] font-bold text-white px-0.5"
                style={{ background: "#ef4444" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none" style={{ color: open || moreActive || profileActive ? "#fff" : "#555" }}>
            Me
          </span>
        </button>
      </nav>

      {/* Backdrop */}
      {open && (
        <div className="mobile-nav-drawer fixed inset-0 z-[60]" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)} />
      )}

      {/* Slide-up drawer */}
      <div className="mobile-nav-drawer fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl overflow-hidden flex-col transition-transform duration-300"
        style={{
          background: "#111",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          maxHeight: "85dvh",
          transform: open ? "translateY(0)" : "translateY(100%)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Profile header */}
        <div className="px-4 pt-2 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 flex-1 min-w-0">
              {photoURL ? (
                <img src={photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 44, height: 44 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ width: 44, height: 44, background: "#222", color: "#888" }}>{initial}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{displayName}</p>
                <p className="text-xs" style={{ color: "#555" }}>View profile</p>
              </div>
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)}
              className="btn-glass w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#666" }}>settings</span>
            </Link>
          </div>
        </div>

        {/* Scrollable menu */}
        <div className="overflow-y-auto flex-1 px-3 py-2">

          {/* DASHBOARD — featured entry */}
          <Link href="/dashboard" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-4 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#0a0a12,#111128)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at left, rgba(167,139,250,0.12) 0%, transparent 65%)" }} />
            <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>bar_chart</span>
            </div>
            <div className="relative flex-1 min-w-0">
              <p className="text-sm font-black" style={{ color: "#f2f2f2" }}>Dashboard</p>
              <p className="text-xs" style={{ color: "#666" }}>Stats · Growth · Analytics</p>
            </div>
            <div className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0"
              style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11, color: "#a78bfa" }}>trending_up</span>
              <span className="text-[10px] font-bold" style={{ color: "#a78bfa" }}>STATS</span>
            </div>
          </Link>

          {/* QUICK ACTIONS — 4-column icon strip */}
          <div className="mb-4">
            <p className="text-[10px] font-bold tracking-widest px-1 mb-1.5" style={{ color: "#333" }}>QUICK ACTIONS</p>
            <div className="flex" style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 }}>
              {quickActions.map((item, idx) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-4"
                    style={{
                      color: active ? "#fff" : "#888",
                      borderRight: idx < quickActions.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                    }}>
                    <span className="relative">
                      <span className="material-symbols-outlined" style={{ fontSize: 24, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                        {item.icon}
                      </span>
                      {item.badge && unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: "#ef4444" }}>
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-medium leading-none">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Section groups — 2-column grid */}
          {moreGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="text-[10px] font-bold tracking-widest px-1 mb-1.5" style={{ color: "#333" }}>
                {group.label.toUpperCase()}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl"
                      style={{ background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: active ? "#fff" : "#888" }}>
                      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 19, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                        {item.icon}
                      </span>
                      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>›</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Advertise — shown when enabled */}
          {advertiseEnabled && (
            <div className="mb-4">
              <p className="text-[10px] font-bold tracking-widest px-1 mb-1.5" style={{ color: "#333" }}>GROW</p>
              <Link href="/advertise" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(168,85,247,0.08))", border: "1px solid rgba(124,58,237,0.2)" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>ads_click</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Advertise</p>
                  <p className="text-xs" style={{ color: "#666" }}>Reach thousands of fitness users</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}>NEW</span>
              </Link>
            </div>
          )}

          {/* Admin Panel — same structure as original, no overflow-hidden wrapper */}
          {isOwner && (
            <div className="mt-1 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <Link href="/admin" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{ background: pathname.startsWith("/admin") ? "rgba(239,68,68,0.1)" : "transparent", color: "#f87171" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
                <span className="text-sm font-medium">Admin Panel</span>
              </Link>
            </div>
          )}
        </div>

        {/* Sign out */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={handleSignOut}
            className="btn-glass w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ color: "#777" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>logout</span>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
