"use client";

import { useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

// Your Firebase VAPID key — get this from Firebase Console >
// Project Settings > Cloud Messaging > Web Push certificates > Key pair
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !VAPID_KEY || typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    // Only request if not already granted or denied
    if (Notification.permission === "denied") return;

    const setup = async () => {
      try {
        // Wait for SW to be ready
        const reg = await navigator.serviceWorker.ready;

        // Request permission (only prompts if 'default')
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Get FCM token via push subscription (VAPID)
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
        });

        // Save subscription endpoint to Firestore
        await setDoc(
          doc(db, "users", user.uid, "pushTokens", "web"),
          { subscription: JSON.stringify(sub), updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch {}
    };

    // Delay to avoid blocking first paint
    const t = setTimeout(setup, 3000);
    return () => clearTimeout(t);
  }, [user]);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
