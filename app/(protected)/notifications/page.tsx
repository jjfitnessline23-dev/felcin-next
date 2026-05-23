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
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

function notifText(n: Notif) {
  const name = n.senderName || "Someone";
  switch (n.type) {
    case "like": return `liked your post`;
    case "comment": return `commented on your post`;
    case "follow": return `started following you`;
    case "mention": return `mentioned you in a post`;
    default: return n.message || `sent you a notification`;
  }
}

function notifConfig(type: string) {
  switch (type) {
    case "like": return { icon: "favorite", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
    case "comment": return { icon: "chat_bubble", color: "#fff", bg: "rgba(255,255,255,0.08)" };
    case "follow": return { icon: "person_add", color: "#fff", bg: "rgba(255,255,255,0.08)" };
    case "mention": return { icon: "alternate_email", color: "#fff", bg: "rgba(255,255,255,0.08)" };
    default: return { icon: "notifications", color: "#888", bg: "rgba(255,255,255,0.06)" };
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // No orderBy to avoid requiring a composite index — sort client-side
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      limit(50)
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

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAll}
            className="text-sm font-semibold border-none bg-transparent cursor-pointer px-3 py-1.5 rounded-full"
            style={{ color: "#fff", background: "rgba(255,255,255,0.08)" }}>
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>notifications</span>
          </div>
          <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>All caught up</p>
          <p className="text-sm" style={{ color: "#555" }}>Likes, comments and follows will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {notifs.map((n) => {
            const { icon, color, bg } = notifConfig(n.type);
            const href = n.postId ? `/comments?postId=${n.postId}` : n.senderId ? `/user-profile?uid=${n.senderId}` : "#";
            return (
              <Link key={n.id} href={href}
                onClick={() => !n.read && updateDoc(doc(db, "notifications", n.id), { read: true })}
                className="flex items-center gap-3 p-3.5 rounded-2xl transition-all"
                style={{
                  background: n.read ? "#131313" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${n.read ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`,
                }}>
                {/* Avatar with icon badge */}
                <div className="relative shrink-0">
                  {n.senderPhoto ? (
                    <img src={n.senderPhoto} alt="" className="rounded-full object-cover" style={{ width: 44, height: 44 }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: "#1a1a1a" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555" }}>person</span>
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: bg }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 11, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug" style={{ color: "#d0d0d0" }}>
                    <span className="font-semibold" style={{ color: "#f2f2f2" }}>{n.senderName || "Someone"} </span>
                    {notifText(n)}
                  </p>
                  {n.createdAt?.seconds && (
                    <p className="text-xs mt-0.5" style={{ color: "#444" }}>{timeAgo(n.createdAt.seconds)}</p>
                  )}
                </div>

                {!n.read && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#fff" }} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
