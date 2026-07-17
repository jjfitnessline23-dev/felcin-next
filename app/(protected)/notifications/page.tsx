"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, limit, orderBy, onSnapshot, updateDoc, doc, writeBatch } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface Notif {
  id: string; type: string; senderId?: string; senderName?: string; senderPhoto?: string;
  postId?: string; read: boolean; createdAt?: { seconds: number }; message?: string;
}

function timeAgo(s: number) {
  const d = Math.floor(Date.now() / 1000) - s;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

function notifText(n: Notif) {
  switch (n.type) {
    case "like":    return "liked your post";
    case "comment": return "commented on your post";
    case "follow":  return "started following you";
    case "mention": return "mentioned you in a post";
    case "message": return n.message ? `sent you a message: "${n.message}"` : "sent you a message";
    case "live":    return "went live";
    default:        return n.message || "sent you a notification";
  }
}

function notifConfig(type: string) {
  switch (type) {
    case "like":    return { icon: "favorite",        color: "#ef4444", bg: "rgba(239,68,68,0.18)",    border: "rgba(239,68,68,0.3)" };
    case "comment": return { icon: "chat_bubble",     color: "#60a5fa", bg: "rgba(96,165,250,0.18)",   border: "rgba(96,165,250,0.3)" };
    case "follow":  return { icon: "person_add",      color: "#34d399", bg: "rgba(52,211,153,0.18)",   border: "rgba(52,211,153,0.3)" };
    case "mention": return { icon: "alternate_email", color: "#a78bfa", bg: "rgba(167,139,250,0.18)",  border: "rgba(167,139,250,0.3)" };
    case "message": return { icon: "chat",            color: "#06b6d4", bg: "rgba(6,182,212,0.18)",    border: "rgba(6,182,212,0.3)" };
    case "live":    return { icon: "sensors",         color: "#ef4444", bg: "rgba(239,68,68,0.18)",    border: "rgba(239,68,68,0.3)" };
    default:        return { icon: "notifications",   color: "#888",    bg: "rgba(255,255,255,0.08)",  border: "rgba(255,255,255,0.12)" };
  }
}

function groupByDate(notifs: Notif[]) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate()-1);
  const todayTs = todayStart.getTime() / 1000;
  const yesterdayTs = yesterdayStart.getTime() / 1000;

  const today: Notif[] = [], yesterday: Notif[] = [], earlier: Notif[] = [];
  notifs.forEach((n) => {
    const s = n.createdAt?.seconds ?? 0;
    if (s >= todayTs) today.push(n);
    else if (s >= yesterdayTs) yesterday.push(n);
    else earlier.push(n);
  });

  const groups: { label: string; items: Notif[] }[] = [];
  if (today.length)     groups.push({ label: "Today",     items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length)   groups.push({ label: "Earlier",   items: earlier });
  return groups;
}

function NotifSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="skeleton rounded-full shrink-0" style={{ width: 46, height: 46 }} />
      <div className="flex-1 flex flex-col gap-2">
        <div className="skeleton rounded-full" style={{ width: "70%", height: 12 }} />
        <div className="skeleton rounded-full" style={{ width: "35%", height: 10 }} />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(30);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    return onSnapshot(q,
      (snap) => {
        setNotifs(snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Notif, "id">) }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  const markAll = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    notifs.filter((n) => !n.read).forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
  };

  const unreadCount = notifs.filter((n) => !n.read).length;
  const groups = groupByDate(notifs.slice(0, displayLimit));
  const hasMore = notifs.length > displayLimit;

  return (
    <div className="max-w-xl mx-auto pb-6">
      <PageHeader title="Notifications" right={
        unreadCount > 0 && (
          <button onClick={markAll}
            className="btn-glass text-sm font-semibold border-none cursor-pointer px-4 py-2 rounded-full"
            style={{ color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }}>
            Mark all read
          </button>
        )
      } />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0a0614 0%,#110a20 50%,#0a0614 100%)", border: "1px solid rgba(167,139,250,0.2)", minHeight: 120 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.35),transparent)", animation: "scanLine 6s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-40%", left: "50%", transform: "translateX(-50%)", width: 360, height: 360, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.22) 0%,transparent 65%)", animation: "heroGlow 5s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 110, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.35)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>notifications</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>NOTIFICATIONS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.4rem,5vw,1.8rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Activity</h1>
          {!loading && (
            <div className="flex items-center gap-4">
              <div><span className="text-base font-black" style={{ color: unreadCount > 0 ? "#a78bfa" : "#555" }}>{unreadCount}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>unread</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#555" }}>{notifs.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>total</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1,2,3,4,5].map((i) => <NotifSkeleton key={i} />)}
          </div>
        ) : notifs.length === 0 ? (
          <div className="ghost-bg text-center py-24 rounded-3xl">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#4a3a6a" }}>notifications</span>
            </div>
            <p className="font-semibold mb-2" style={{ color: "#f2f2f2" }}>All caught up</p>
            <p className="text-sm" style={{ color: "#555" }}>Likes, comments and follows will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-black mb-2.5 px-1 tracking-widest" style={{ color: "#333" }}>{group.label.toUpperCase()}</p>
                <div className="flex flex-col gap-1.5">
                  {group.items.map((n) => {
                    const { icon, color, bg, border } = notifConfig(n.type);
                    const href = n.type === "message"
                      ? `/private-chats?uid=${n.senderId}`
                      : n.postId ? `/comments?postId=${n.postId}`
                      : n.senderId ? `/user-profile?uid=${n.senderId}` : "#";
                    return (
                      <Link key={n.id} href={href}
                        onClick={() => !n.read && updateDoc(doc(db, "notifications", n.id), { read: true })}
                        className="flex items-center gap-3 p-3.5 rounded-2xl transition-all relative overflow-hidden"
                        style={{
                          background: n.read ? "#0f0f0f" : "#141420",
                          border: `1px solid ${n.read ? "rgba(255,255,255,0.05)" : border}`,
                          boxShadow: n.read ? "none" : `0 0 12px ${bg.replace("0.18","0.08")}`,
                        }}>
                        {/* Colored left accent for unread */}
                        {!n.read && (
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl" style={{ background: color }} />
                        )}

                        {/* Avatar + icon badge */}
                        <div className="relative shrink-0">
                          {n.senderPhoto ? (
                            <img src={n.senderPhoto} alt="" className="rounded-full object-cover" style={{ width: 46, height: 46 }} />
                          ) : (
                            <div className="rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#444" }}>person</span>
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: bg, border: `2px solid ${n.read ? "#0f0f0f" : "#141420"}` }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug" style={{ color: n.read ? "#888" : "#e0e0e0" }}>
                            <span className="font-bold" style={{ color: n.read ? "#aaa" : "#f2f2f2" }}>{n.senderName || "Someone"} </span>
                            {notifText(n)}
                          </p>
                          {n.createdAt?.seconds && (
                            <p className="text-xs mt-0.5" style={{ color: n.read ? "#333" : "#555" }}>{timeAgo(n.createdAt.seconds)}</p>
                          )}
                        </div>

                        {!n.read && (
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {hasMore && (
              <button onClick={() => setDisplayLimit((l) => l + 30)}
                className="btn-glass w-full py-3 rounded-2xl text-sm font-semibold mt-2 border-none cursor-pointer"
                style={{ color: "#666", border: "1px solid rgba(255,255,255,0.08)" }}>
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
