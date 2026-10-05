import { useState, useEffect } from "react";
import { collection, query, where, limit, onSnapshot, getDoc, doc } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

const PREF_KEY: Record<string, string> = {
  like: "notifLikes", comment: "notifComments", follow: "notifFollows",
  repost: "notifReposts", live: "notifLive",
};

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let muted = new Set<string>();
    getDoc(doc(db, "users", user.uid, "settings", "preferences")).then((snap) => {
      if (snap.exists()) {
        const p = snap.data();
        const m = new Set<string>();
        for (const [type, key] of Object.entries(PREF_KEY)) if (p[key] === false) m.add(type);
        muted = m;
      }
    }).catch(() => {});
    // Query unread directly rather than fetching an arbitrary 50 and filtering — the old
    // way could miss/overcount once a user passed 50 total notifications.
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      where("read", "==", false),
      limit(99)
    );
    return onSnapshot(q, (snap) => {
      // Don't count notification types the user has muted in Settings.
      setCount(snap.docs.filter((d) => !muted.has(d.data().type)).length);
    }, () => {});
  }, [user]);

  return count;
}
