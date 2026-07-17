"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, canAccessApp } from "@/lib/auth";
import { doc, getDoc, setDoc, increment } from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import OfflineBanner from "@/components/OfflineBanner";
import EmailVerifyBanner from "@/components/EmailVerifyBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { deriveNameFromEmail } from "@/lib/nameUtils";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, banned, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onboardingChecked = useRef(false);
  const userCountedToday = useRef(false);
  const profileEnsured = useRef(false);
  usePushNotifications();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (banned) {
      signOut().then(() => router.replace("/login?banned=1"));
      return;
    }
    if (!canAccessApp(user)) {
      router.replace("/login?verify=1");
      return;
    }
    // Ensure user document exists in Firestore (covers owner accounts + Google users who skipped profile setup)
    if (!profileEnsured.current) {
      profileEnsured.current = true;
      const isOwner = OWNER_UIDS.includes(user.uid);
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (!snap.exists() || isOwner) {
          const profile = {
            displayName: user.displayName || deriveNameFromEmail(user.email || ""),
            photoURL: user.photoURL || "",
            email: user.email || "",
            ...(isOwner ? { verified: true, badge: "⭐" } : {}),
          };
          setDoc(doc(db, "users", user.uid), profile, { merge: true }).catch(() => {});
          setDoc(doc(db, "users", user.uid, "public", "profile"), profile, { merge: true }).catch(() => {});
          if (isOwner) {
            setDoc(doc(db, "users", user.uid, "settings", "onboarding"), { completed: true, interests: [] }, { merge: true }).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    // Check onboarding once per session, skip if already on onboarding page
    if (!onboardingChecked.current && pathname !== "/onboarding") {
      onboardingChecked.current = true;
      getDoc(doc(db, "users", user.uid, "settings", "onboarding")).then((snap) => {
        if (!snap.exists() || !snap.data()?.completed) {
          router.replace("/onboarding");
        }
      }).catch(() => {});
    }
  }, [user, loading, banned, signOut, router, pathname]);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    setDoc(doc(db, "analytics", `daily-${today}`), { pageViews: increment(1) }, { merge: true }).catch(() => {});
    setDoc(doc(db, "analytics", "totals"), { pageViews: increment(1) }, { merge: true }).catch(() => {});
    if (!userCountedToday.current) {
      userCountedToday.current = true;
      const userDayRef = doc(db, "analytics", `session-${user.uid}-${today}`);
      getDoc(userDayRef).then((snap) => {
        if (!snap.exists()) {
          setDoc(userDayRef, { uid: user.uid, date: today }).catch(() => {});
          setDoc(doc(db, "analytics", `daily-${today}`), { activeUsers: increment(1) }, { merge: true }).catch(() => {});
          setDoc(doc(db, "analytics", "totals"), { activeUsers: increment(1) }, { merge: true }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [user, pathname]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#090909" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not authenticated — redirect is already firing in the useEffect above.
  // Show a plain dark screen instead of the spinner so the user doesn't see
  // a stuck spinner while the router.replace('/login') navigation completes.
  if (!user || banned || !canAccessApp(user)) {
    return <div className="fixed inset-0" style={{ background: "#090909" }} />;
  }

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <OfflineBanner />
      <EmailVerifyBanner />
      <Sidebar />
      <main className="lg:pl-60 pb-16 lg:pb-0 min-h-screen" style={{ width: "100%", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="w-full lg:max-w-[430px] lg:mx-auto">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
