import { useState, useEffect } from "react";
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setCount(snap.docs.filter((d) => !d.data().read).length);
    }, () => {});
  }, [user]);

  return count;
}
