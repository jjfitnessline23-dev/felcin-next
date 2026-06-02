"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAuth } from "@/lib/auth";
import { OWNER_UIDS } from "@/lib/firebase";

const moreGroups = [
  {
    label: "Connect",
    items: [
      { href: "/notifications", icon: "notifications", label: "Notifications", badge: true },
      { href: "/private-chats", icon: "chat", label: "Messages" },
      { href: "/following", icon: "group", label: "Connections" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/reels", icon: "play_circle", label: "Reels" },
      { href: "/live", icon: "live_tv", label: "Live" },
      { href: "/stories", icon: "auto_stories", label: "Stories" },
      { href: "/podcasts", icon: "podcasts", label: "Podcasts" },
    ],
  },
  {
    label: "Fitness",
    items: [
      { href: "/challenges", icon: "link", label: "Challenges" },
      { href: "/workouts", icon: "fitness_center", label: "Workout Log" },
      { href: "/schedule", icon: "calendar_month", label: "Schedule" },
    ],
  },
  {
    label: "Creator",
    items: [
      { href: "/dashboard", icon: "bar_chart", label: "Dashboard" },
      { href: "/earnings", icon: "payments", label: "Earnings" },
      { href: "/badges", icon: "verified", label: "Badges" },
      { href: "/bookmarks", icon: "bookmark", label: "Bookmarks" },
    ],
  },
];

// Flat list for active-path detection
const moreItems = moreGroups.flatMap((g) => g.items);

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const unread = useUnreadCount();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Profile";
  const photoURL = user?.photoURL;
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleSignOut = async () => { setOpen(false); await signOut(); router.push("/login"); };

  if (pathname.startsWith("/comments") || pathname.startsWith("/private-chats")) return null;

  const profileActive = pathname.startsWith("/profile") || pathname.startsWith("/profile-settings");
  const moreActive = moreItems.some((i) => pathname.startsWith(i.href));
  const isGhostPath = pathname.startsWith("/ghost");
  const isExplorePath = pathname.startsWith("/explore") || pathname.startsWith("/search");

  const tabs = [
    { href: "/", icon: "home", label: "Home", active: pathname === "/" },
    { href: "/ghost", icon: "sprint", label: "Workout", active: isGhostPath, accent: true },
    null, // create button placeholder
    { href: "/explore", icon: "explore", label: "Explore", active: isExplorePath },
  ];

  return (
    <>
      {/* Bottom nav */}
      <nav className="mobile-nav-bar fixed bottom-0 left-0 right-0 z-50 items-stretch"
        style={{
          background: "rgba(9,9,9,0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>

        {tabs.map((tab, i) => {
          if (tab === null) {
            // Create button — hidden on live/podcasts
            if (pathname.startsWith("/live") || pathname.startsWith("/podcasts")) return <div key="create-spacer" className="flex-1" />;
            return (
              <Link key="create" href="/creator" className="flex-1 flex items-center justify-center py-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#fff" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#000", fontVariationSettings: "'FILL' 1, 'wght' 500" }}>add</span>
                </div>
              </Link>
            );
          }
          return (
            <Link key={tab.href} href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              style={{ color: tab.active ? (tab.accent ? "#a78bfa" : "#fff") : (tab.accent ? "#6d51c4" : "#555") }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 24,
                fontVariationSettings: tab.active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
              }}>{tab.icon}</span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}

        {/* Profile picture — replaces 3-bar More button */}
        <button onClick={() => setOpen(true)}
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
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#666" }}>settings</span>
            </Link>
          </div>
        </div>

        {/* Menu items — grouped */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
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
                      className="flex items-center gap-3 px-3 py-3 rounded-xl relative"
                      style={{ background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? "#fff" : "#888" }}>
                      <span className="relative">
                        <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                          {item.icon}
                        </span>
                        {item.badge && unread > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7px] font-bold text-white px-0.5"
                            style={{ background: "#ef4444" }}>
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

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

        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", color: "#666" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>logout</span>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
