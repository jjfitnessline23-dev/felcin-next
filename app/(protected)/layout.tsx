"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, canAccessApp } from "@/lib/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, banned, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onboardingChecked = useRef(false);
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

  if (loading || !user || banned || !canAccessApp(user)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#090909" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
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
