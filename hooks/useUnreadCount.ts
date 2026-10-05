import { useState, useEffect } from "react";
import { collection, query, where, limit, onSnapshot } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Query unread directly rather than fetching an arbitrary 50 and filtering — the old
    // way could miss/overcount once a user passed 50 total notifications.
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      where("read", "==", false),
      limit(99)
    );
    return onSnapshot(q, (snap) => {
      setCount(snap.size);
    }, () => {});
  }, [user]);

  return count;
}
