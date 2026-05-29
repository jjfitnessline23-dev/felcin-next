"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAuth } from "@/lib/auth";
import { OWNER_UIDS } from "@/lib/firebase";

const bottomItems = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/ghost", icon: "sprint", label: "Workout", accent: true },
  { href: "/creator", icon: "add", label: "", isCreate: true },
  { href: "/notifications", icon: "notifications", label: "Alerts" },
];

const moreItems = [
  { href: "/reels", icon: "play_circle", label: "Reels" },
  { href: "/live", icon: "live_tv", label: "Live" },
  { href: "/challenges", icon: "link", label: "Challenges" },
  { href: "/explore", icon: "explore", label: "Explore" },
  { href: "/search", icon: "search", label: "Search" },
  { href: "/stories", icon: "auto_stories", label: "Stories" },
  { href: "/schedule", icon: "calendar_month", label: "Schedule" },
  { href: "/workouts", icon: "fitness_center", label: "Workout Log" },
  { href: "/podcasts", icon: "podcasts", label: "Podcasts" },
  { href: "/private-chats", icon: "chat", label: "Messages" },
  { href: "/bookmarks", icon: "bookmark", label: "Bookmarks" },
  { href: "/dashboard", icon: "bar_chart", label: "Dashboard" },
];

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

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push("/login");
  };

  if (pathname.startsWith("/comments") || pathname.startsWith("/private-chats")) return null;

  const moreActive = moreItems.some((i) => pathname.startsWith(i.href)) || pathname.startsWith("/profile");

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: "rgba(9,9,9,0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {bottomItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const isNotif = item.href === "/notifications";

          if (item.isCreate) {
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex items-center justify-center py-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: "#fff" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#000", fontVariationSettings: "'FILL' 1, 'wght' 500" }}>add</span>
                </div>
              </Link>
            );
          }

          const isGhost = item.href === "/ghost";

          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              style={{ color: active ? (isGhost ? "#a78bfa" : "#fff") : (isGhost ? "#6d51c4" : "#555") }}>
              <span className="relative">
                <span className="material-symbols-outlined" style={{
                  fontSize: 24,
                  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
                }}>
                  {item.icon}
                </span>
                {isNotif && unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white px-0.5"
                    style={{ background: "#ef4444" }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              {item.label && (
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              )}
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 border-none bg-transparent cursor-pointer"
          style={{ color: moreActive || open ? "#fff" : "#555" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, fontVariationSettings: (moreActive || open) ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>
            menu
          </span>
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-up drawer */}
      <div
        className="lg:hidden fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl overflow-hidden flex flex-col transition-transform duration-300"
        style={{
          background: "#111",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          maxHeight: "85dvh",
          transform: open ? "translateY(0)" : "translateY(100%)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div className="px-4 pt-2 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Link href="/profile" className="flex items-center gap-3">
            {photoURL ? (
              <img src={photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 44, height: 44 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ width: 44, height: 44, background: "#222", color: "#888" }}>
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{displayName}</p>
              <p className="text-xs" style={{ color: "#555" }}>View profile</p>
            </div>
          </Link>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2">
          <div className="grid grid-cols-2 gap-1">
            {moreItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl"
                  style={{
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    color: active ? "#fff" : "#888",
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                    {item.icon}
                  </span>
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}

            {isOwner && (
              <Link href="/admin"
                className="flex items-center gap-3 px-3 py-3 rounded-xl col-span-2"
                style={{
                  background: pathname.startsWith("/admin") ? "rgba(239,68,68,0.1)" : "transparent",
                  color: "#f87171",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  marginTop: 4,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
                <span className="text-sm font-medium">Admin Panel</span>
              </Link>
            )}
          </div>
        </div>

        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={handleSignOut}
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
