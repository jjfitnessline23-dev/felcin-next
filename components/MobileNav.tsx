"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadCount } from "@/hooks/useUnreadCount";

const items = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/explore", icon: "explore", label: "Explore" },
  { href: "/creator", icon: "add", label: "" },
  { href: "/notifications", icon: "notifications", label: "Alerts" },
  { href: "/profile", icon: "person", label: "Me" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();

  return (
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
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const isCreate = item.href === "/creator";
        const isNotif = item.href === "/notifications";

        if (isCreate) {
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

        return (
          <Link key={item.href} href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
            style={{ color: active ? "#fff" : "#555" }}>
            <span className="relative">
              <span className="material-symbols-outlined" style={{ fontSize: 24, fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>
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
    </nav>
  );
}
