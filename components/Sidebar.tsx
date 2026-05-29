"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { OWNER_UIDS } from "@/lib/firebase";

const primaryLinks = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/ghost", icon: "sprint", label: "Ghost Workouts", accent: true },
  { href: "/reels", icon: "play_circle", label: "Reels" },
  { href: "/live", icon: "live_tv", label: "Live" },
  { href: "/challenges", icon: "link", label: "Challenges" },
  { href: "/explore", icon: "explore", label: "Explore" },
  { href: "/search", icon: "search", label: "Search" },
];

const secondaryLinks = [
  { href: "/private-chats", icon: "chat", label: "Messages" },
  { href: "/notifications", icon: "notifications", label: "Notifications" },
  { href: "/bookmarks", icon: "bookmark", label: "Bookmarks" },
  { href: "/dashboard", icon: "bar_chart", label: "Dashboard" },
];

const moreLinks = [
  { href: "/stories", icon: "auto_stories", label: "Stories" },
  { href: "/schedule", icon: "calendar_month", label: "Schedule" },
  { href: "/workouts", icon: "fitness_center", label: "Workout Log" },
  { href: "/podcasts", icon: "podcasts", label: "Podcasts" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const [showMore, setShowMore] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Profile";
  const photoURL = user?.photoURL;
  const initial = displayName.charAt(0).toUpperCase();
  const isOwner = user && OWNER_UIDS.includes(user.uid);

  const renderLink = (l: { href: string; icon: string; label: string; accent?: boolean }) => {
    const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
    const isNotif = l.href === "/notifications";
    return (
      <Link key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}
        style={l.accent && !active ? { color: "#a78bfa" } : undefined}>
        <span className="relative">
          <span className="material-symbols-outlined" style={{
            fontSize: 19,
            fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
            color: l.accent && !active ? "#a78bfa" : undefined,
          }}>{l.icon}</span>
          {isNotif && unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
              style={{ background: "#ef4444" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        {l.label}
        {l.accent && <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>NEW</span>}
      </Link>
    );
  };

  return (
    <aside
      className="hidden lg:flex flex-col w-60 shrink-0 fixed top-0 left-0 bottom-0 z-30 overflow-y-auto"
      style={{ background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#1c1c1c" }}>
          <img src="/static/logo-nav.png" alt="" width={18} height={18} />
        </div>
        <span className="font-bold text-lg tracking-tight" style={{ color: "#f2f2f2" }}>Felcin</span>
      </Link>

      {/* Create button */}
      <div className="px-3 mb-2">
        <Link href="/creator"
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl font-semibold text-sm"
          style={{ background: "#fff", color: "#000" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 19 }}>add_circle</span>
          Create
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {primaryLinks.map(renderLink)}

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "6px 4px" }} />

        {secondaryLinks.map(renderLink)}

        {/* More toggle */}
        <button
          onClick={() => setShowMore((v) => !v)}
          className="nav-link border-none bg-transparent cursor-pointer w-full text-left"
          style={{ color: "#444" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{showMore ? "expand_less" : "expand_more"}</span>
          {showMore ? "Less" : "More"}
        </button>

        {showMore && moreLinks.map(renderLink)}

        {/* Admin link — owner only */}
        {isOwner && (
          <Link href="/admin" className={`nav-link${pathname.startsWith("/admin") ? " active" : ""}`}
            style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 19, color: "#ef4444" }}>admin_panel_settings</span>
            <span style={{ color: "#ef4444" }}>Admin</span>
          </Link>
        )}
      </nav>

      {/* Legal links */}
      <div className="px-4 pb-2 flex flex-wrap gap-x-3 gap-y-1">
        <a href="/terms" target="_blank" className="text-xs" style={{ color: "#2a2a2a", textDecoration: "none" }}>Terms</a>
        <a href="/privacy" target="_blank" className="text-xs" style={{ color: "#2a2a2a", textDecoration: "none" }}>Privacy</a>
        <a href="/guidelines" target="_blank" className="text-xs" style={{ color: "#2a2a2a", textDecoration: "none" }}>Guidelines</a>
      </div>

      {/* Profile footer */}
      <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
          <Link href="/profile" className="flex items-center gap-2.5 flex-1 min-w-0">
            {photoURL ? (
              <img src={photoURL} alt="" width={34} height={34} className="rounded-full object-cover shrink-0" style={{ width: 34, height: 34 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 34, height: 34, background: "#222", color: "#888" }}>
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{displayName}</div>
              <div className="text-xs" style={{ color: "#444" }}>View profile</div>
            </div>
          </Link>
          <button onClick={handleSignOut} title="Sign out"
            className="icon-btn shrink-0" style={{ width: 30, height: 30 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#444" }}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
