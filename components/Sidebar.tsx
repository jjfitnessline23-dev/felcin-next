"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import FelcinLogo from "@/components/FelcinLogo";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { OWNER_UIDS, db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/db";

const primaryLinks = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/ghost", icon: "sprint", label: "Ghost Workouts", accent: true },
  { href: "/podcasts", icon: "mic", label: "Podcast Studio", studio: true },
  { href: "/reels", icon: "play_circle", label: "Reels" },
  { href: "/live", icon: "live_tv", label: "Live Studio" },
  { href: "/challenges", icon: "link", label: "Challenges" },
  { href: "/explore", icon: "explore", label: "Explore" },
];

const secondaryLinks = [
  { href: "/private-chats", icon: "chat", label: "Messages" },
  { href: "/notifications", icon: "notifications", label: "Notifications" },
  { href: "/bookmarks", icon: "bookmark", label: "Bookmarks" },
  { href: "/dashboard", icon: "bar_chart", label: "Dashboard" },
];

const moreLinks = [
  { href: "/progress", icon: "compare", label: "Progress Photos" },
  { href: "/stories", icon: "auto_stories", label: "Stories" },
  { href: "/schedule", icon: "calendar_month", label: "Schedule" },
  { href: "/workouts", icon: "fitness_center", label: "Workout Log" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const [showMore, setShowMore] = useState(false);
  const [advertiseEnabled, setAdvertiseEnabled] = useState(true);

  useEffect(() => {
    return onSnapshot(doc(db, "config", "features"), (snap) => {
      if (snap.exists()) setAdvertiseEnabled(snap.data().advertiseEnabled ?? true);
    });
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Profile";
  const photoURL = user?.photoURL;
  const initial = displayName.charAt(0).toUpperCase();
  const isOwner = user && OWNER_UIDS.includes(user.uid);

  const renderLink = (l: { href: string; icon: string; label: string; accent?: boolean; studio?: boolean }) => {
    const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
    const isNotif = l.href === "/notifications";
    const iconColor = l.studio && !active ? "#a78bfa" : l.accent && !active ? "#a78bfa" : undefined;
    return (
      <Link key={l.href} href={l.href}
        className={`nav-link${active ? " active" : ""}`}
        style={(l.accent || l.studio) && !active ? { color: "#a78bfa" } : undefined}>
        <span className="relative">
          <span className="material-symbols-outlined" style={{
            fontSize: 19,
            fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
            color: iconColor,
          }}>{l.icon}</span>
          {isNotif && unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
              style={{ background: "#ef4444" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        {l.label}
        {l.studio && !active && (
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.18)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>LIVE</span>
        )}
        {l.accent && !l.studio && <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>NEW</span>}
      </Link>
    );
  };

  return (
    <aside
      className="sidebar-desktop flex-col w-60 shrink-0 fixed top-0 left-0 bottom-0 z-30 overflow-y-auto"
      style={{ background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <FelcinLogo size={32} />
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

      {/* Ghost Workout promo card */}
      <div className="px-3 mb-3">
        <Link href="/ghost"
          className="block rounded-2xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #0c0818 0%, #100c22 60%, #0a0814 100%)", border: "1px solid rgba(109,40,217,0.35)", textDecoration: "none" }}>
          {/* Watermark ghost */}
          <img src="/static/logo-full.svg" alt="" aria-hidden="true"
            style={{ position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", width: 90, height: 90, opacity: 0.14, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: -20, right: 10, width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div className="relative p-3" style={{ zIndex: 1 }}>
            <div className="flex items-center gap-1.5 mb-1">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 20, height: 20, borderRadius: 5 }} />
              <span className="text-[9px] font-bold tracking-[0.15em]" style={{ color: "#6d28d9" }}>GHOST WORKOUT</span>
            </div>
            <p className="text-sm font-bold mb-0.5" style={{ color: "#f3e8ff", letterSpacing: "-0.2px" }}>Train with the Ghost.</p>
            <svg width="70" height="12" viewBox="0 0 70 12" style={{ display: "block" }}>
              <path d="M 0,6 L 15,6 L 18,4 L 21,6 L 25,6 L 27,8 L 29,1 L 32,9 L 34,6 C 36,6 37,3 40,6 L 70,6"
                fill="none" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            </svg>
          </div>
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {primaryLinks.map(renderLink)}

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "6px 4px" }} />

        {secondaryLinks.map(renderLink)}

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "6px 4px" }} />

        {/* Monetization section */}
        <p className="text-[10px] font-bold tracking-widest px-2 mt-1 mb-0.5" style={{ color: "#333" }}>MONETIZE</p>
        {renderLink({ href: "/earnings", icon: "payments", label: "Earnings" })}
        {renderLink({ href: "/badges", icon: "verified", label: "Badges" })}
        {renderLink({ href: "/settings", icon: "workspace_premium", label: "Premium" })}
        {advertiseEnabled && renderLink({ href: "/advertise", icon: "ads_click", label: "Advertise" })}

        {/* More toggle */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "6px 4px" }} />
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
            className="icon-btn btn-glass shrink-0" style={{ width: 30, height: 30, borderRadius: "50%" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#666" }}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
