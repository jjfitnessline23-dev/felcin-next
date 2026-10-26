"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "@/lib/db";
import { db } from "@/lib/firebase";

/**
 * iOS App Store "kill-switch" for digital-goods purchases.
 *
 * Apple requires in-app purchase (IAP) for digital goods; Felcin sells badges +
 * Premium via Stripe. If a reviewer ever flags Guideline 3.1.1, the owner can set
 * config/features.iosPurchasesEnabled = false (admin panel toggle) to instantly
 * hide badge/Premium BUYING inside the iOS app — with NO app resubmission — while
 * the website keeps selling normally.
 *
 * - Web + Android: always allowed (not affected by the flag).
 * - iOS native (Capacitor): allowed unless the flag is explicitly false.
 * - Fails OPEN: any error or missing config keeps purchases enabled, so a Firestore
 *   hiccup never blocks sales for everyone.
 *
 * Returns null while loading, then a boolean.
 */
export function usePurchasesAllowed(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    const isIOSNative = !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios";
    if (!isIOSNative) { setAllowed(true); return; }

    getDoc(doc(db, "config", "features"))
      .then((snap) => setAllowed(snap.exists() ? (snap.data().iosPurchasesEnabled ?? true) : true))
      .catch(() => setAllowed(true));
  }, []);

  return allowed;
}
