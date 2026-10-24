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
import UpdateBanner from "@/components/UpdateBanner";
import HalloweenTheme from "@/components/HalloweenTheme";
import ChristmasTheme from "@/components/ChristmasTheme";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { deriveNameFromEmail } from "@/lib/nameUtils";
import ErrorBoundary from "@/components/ErrorBoundary";
import MarketingHome from "@/components/MarketingHome";
import FeatureUpsell, { type FeatureUpsellProps } from "@/components/FeatureUpsell";

// Pages that must never be the first thing painted on a cold app open
const COLD_START_RESET = ["/creator", "/stories", "/live/", "/run"];

// Felcin has no separate public marketing page, so the app itself is the landing: a
// logged-out visitor may BROWSE these surfaces read-only. Everything else (creator,
// settings, earnings, chats, onboarding, etc.) still requires sign-in.
const PUBLIC_BROWSE = ["/explore", "/reels", "/search", "/tag", "/comments", "/user-profile", "/stories"];
function isPublicBrowse(path: string) {
  return path === "/" || PUBLIC_BROWSE.some((p) => path === p || path.startsWith(p + "/"));
}

// Gated features show a logged-out visitor an explainer + signup CTA instead of
// silently bouncing them to /login.
const FEATURE_GATES: Record<string, FeatureUpsellProps> = {
  "/ghost": { icon: "sprint", color: "#f97316", label: "Ghost Workouts", title: "Train with the ghost.", body: "Pick a creator's pre-recorded session and train alongside it in real time — same exercises, same pace, same timer. No guessing what's next, no training alone.", points: ["Follow the session rep by rep", "Keep your streak alive automatically", "New Ghost Workouts from creators you follow"] },
  "/challenges": { icon: "emoji_events", color: "#fbbf24", label: "Challenges", title: "Compete. Beat your PRs.", body: "Join community fitness challenges, climb the leaderboard, and push each other to new personal records.", points: ["Community distance, streak & workout challenges", "Live leaderboards", "Earn bragging rights and PRs"] },
  "/badges": { icon: "verified", color: "#22d3ee", label: "Badges", title: "Earn your badges.", body: "Show verification and creator badges on your profile, and unlock the tools to monetize your audience.", points: ["Profile badges that make you stand out", "Creator monetization tools", "Tips, subscriptions & premium content"], showPricing: true },
  "/settings": { icon: "workspace_premium", color: "#fbbf24", label: "Premium", title: "Go Premium.", body: "Unlock premium Ghost Workouts and premium features across Felcin — $9.99/month or $79.99/year.", points: ["Premium Ghost Workouts from top creators", "Premium features across the platform", "Cancel anytime"], showPricing: true },
};
function featureGate(path: string): FeatureUpsellProps | null {
  return FEATURE_GATES[path] ?? null;
}

// Synchronous cold-start check — runs during render, before any paint
function useColdStartGuard(pathname: string) {
  if (typeof window === "undefined") return false;
  const isWarm = sessionStorage.getItem("felcin_warm") === "1";
  if (!isWarm) sessionStorage.setItem("felcin_warm", "1");
  return !isWarm && COLD_START_RESET.some((p) => pathname.startsWith(p));
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, banned, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onboardingChecked = useRef(false);
  const userCountedToday = useRef(false);
  const profileEnsured = useRef(false);
  const shouldResetToHome = useColdStartGuard(pathname);
  usePushNotifications();

  // Fire the redirect after mount (router needs to be ready)
  useEffect(() => {
    if (shouldResetToHome) router.replace("/");
  }, [shouldResetToHome, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Logged-out: allow read-only browsing of public surfaces and show feature
      // explainers on gated routes; everything else bounces to sign-in.
      if (!isPublicBrowse(pathname) && !featureGate(pathname)) router.replace("/login");
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
    try {
      (window as any).webkit?.messageHandlers?.felcinWatchSync?.postMessage({ uid: user.uid });
    } catch {}
  }, [user?.uid]); // eslint-disable-line

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

  // Cold start on a transient page — paint nothing until redirect fires
  if (shouldResetToHome) {
    return <div className="fixed inset-0" style={{ background: "#090909" }} />;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ background: "#090909" }}>
        <span style={{ fontWeight: 900, fontSize: 26, letterSpacing: "-0.5px", background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Felcin</span>
        <div className="spinner" />
      </div>
    );
  }

  // Logged-out feature explainer (Ghost/Challenges/Badges/Premium) — full-bleed upsell
  // instead of a silent bounce to /login.
  const gate = !user ? featureGate(pathname) : null;
  if (gate) {
    return <FeatureUpsell {...gate} />;
  }
  // A logged-out visitor on a public browse surface renders the app as a guest.
  const guest = !user && isPublicBrowse(pathname);
  // Logged-out home: show the marketing homepage (full-bleed, no app chrome) with a
  // "Browse the feed" CTA. Signed-in users fall through to the real feed below.
  if (guest && pathname === "/") {
    return <MarketingHome />;
  }
  // On a private page while logged-out/banned/unverified, the redirect above is firing —
  // paint a blank dark screen until it completes.
  if (!guest && (!user || banned || !canAccessApp(user))) {
    return <div className="fixed inset-0" style={{ background: "#090909" }} />;
  }

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <HalloweenTheme />
      <ChristmasTheme />
      <UpdateBanner />
      <OfflineBanner />
      <EmailVerifyBanner />
      <Sidebar />
      <main className="lg:pl-60 pb-16 lg:pb-0 min-h-screen" style={{ width: "100%", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="w-full lg:max-w-[430px] lg:mx-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
