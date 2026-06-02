"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, limit, onSnapshot, updateDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

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
    case "like": return "liked your post";
    case "comment": return "commented on your post";
    case "follow": return "started following you";
    case "mention": return "mentioned you in a post";
    case "live": return "went live";
    default: return n.message || "sent you a notification";
  }
}

function notifConfig(type: string) {
  switch (type) {
    case "like":    return { icon: "favorite",       color: "#ef4444", bg: "rgba(239,68,68,0.15)" };
    case "comment": return { icon: "chat_bubble",    color: "#60a5fa", bg: "rgba(96,165,250,0.15)" };
    case "follow":  return { icon: "person_add",     color: "#34d399", bg: "rgba(52,211,153,0.15)" };
    case "mention": return { icon: "alternate_email",color: "#a78bfa", bg: "rgba(167,139,250,0.15)" };
    case "live":    return { icon: "sensors",        color: "#ef4444", bg: "rgba(239,68,68,0.15)" };
    default:        return { icon: "notifications",  color: "#888",    bg: "rgba(255,255,255,0.08)" };
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
      <div className="skeleton rounded-full shrink-0" style={{ width: 44, height: 44 }} />
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

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      limit(60)
    );
    return onSnapshot(q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Notif, "id">) }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifs(sorted);
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
  const groups = groupByDate(notifs);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Notifications</h1>
          <p className="text-xs mt-0.5" style={{ color: "#555" }}>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAll}
            className="text-sm font-semibold border-none cursor-pointer px-4 py-2 rounded-full"
            style={{ color: "#000", background: "#fff" }}>
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3,4,5].map((i) => <NotifSkeleton key={i} />)}
        </div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#2a2a2a" }}>notifications</span>
          </div>
          <p className="font-semibold mb-2" style={{ color: "#f2f2f2" }}>All caught up</p>
          <p className="text-sm" style={{ color: "#555" }}>Likes, comments and follows will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-bold mb-2 px-1 tracking-wide" style={{ color: "#444" }}>{group.label.toUpperCase()}</p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((n) => {
                  const { icon, color, bg } = notifConfig(n.type);
                  const href = n.postId ? `/comments?postId=${n.postId}` : n.senderId ? `/user-profile?uid=${n.senderId}` : "#";
                  return (
                    <Link key={n.id} href={href}
                      onClick={() => !n.read && updateDoc(doc(db, "notifications", n.id), { read: true })}
                      className="flex items-center gap-3 p-3.5 rounded-2xl transition-all"
                      style={{
                        background: n.read ? "#111" : "#181818",
                        border: `1px solid ${n.read ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)"}`,
                      }}>
                      {/* Avatar + icon badge */}
                      <div className="relative shrink-0">
                        {n.senderPhoto ? (
                          <img src={n.senderPhoto} alt="" className="rounded-full object-cover" style={{ width: 46, height: 46 }} />
                        ) : (
                          <div className="rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: "#1a1a1a" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#444" }}>person</span>
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: bg, border: "2px solid #111" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug" style={{ color: n.read ? "#999" : "#e0e0e0" }}>
                          <span className="font-semibold" style={{ color: n.read ? "#ccc" : "#f2f2f2" }}>{n.senderName || "Someone"} </span>
                          {notifText(n)}
                        </p>
                        {n.createdAt?.seconds && (
                          <p className="text-xs mt-0.5" style={{ color: "#3a3a3a" }}>{timeAgo(n.createdAt.seconds)}</p>
                        )}
                      </div>

                      {!n.read && (
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#fff" }} />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
