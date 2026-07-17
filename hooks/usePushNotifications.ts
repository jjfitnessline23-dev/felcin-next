"use client";

import { useEffect } from "react";
import { doc, setDoc } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    const setup = async () => {
      try {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Dynamically import Firebase messaging to avoid SSR issues
        const { getMessaging, getToken } = await import("firebase/messaging");
        const { app } = await import("@/lib/firebase");
        const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!VAPID) return;

        const messaging = getMessaging(app);
        const fcmToken = await getToken(messaging, { vapidKey: VAPID });
        if (!fcmToken) return;

        // Save FCM token to Firestore
        await setDoc(
          doc(db, "users", user.uid, "pushTokens", "web"),
          { fcmToken, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch {}
    };

    const t = setTimeout(setup, 3000);
    return () => clearTimeout(t);
  }, [user]);
}
