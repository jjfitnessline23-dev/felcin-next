"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, OWNER_UIDS } from "./firebase";
import { deriveNameFromEmail } from "./nameUtils";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  canAccess: boolean;
  banned: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  canAccess: false,
  banned: false,
});

export function canAccessApp(user: User | null): boolean {
  if (!user) return false;
  if (user.phoneNumber) return true;
  if (OWNER_UIDS.includes(user.uid)) return true;
  if (user.providerData.some((p) => p.providerId === "google.com")) return true;
  return !!user.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [banned, setBanned] = useState(false);
  // Always start loading:true — this matches the SSR pre-render and avoids the
  // React 18 hydration-suppression bug where a useState initializer mismatch
  // prevents the spinner from ever clearing (re-render is suppressed when the
  // server said true but client initializer returns false).
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On Capacitor: if localStorage has no saved Firebase session, unblock the
    // spinner immediately.  onAuthStateChanged will fire with null — but null→null
    // is a no-op state update and would never trigger a re-render on its own,
    // so we must call setLoading(false) explicitly here for logged-out users.
    const isCapacitorApp =
      process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true" ||
      !!(window as any).Capacitor ||
      (window.location.protocol !== "http:" && window.location.protocol !== "https:");

    if (isCapacitorApp) {
      try {
        const hasSavedSession = Object.keys(localStorage).some(
          (k) => k.startsWith("firebase:authUser:")
        );
        if (!hasSavedSession) {
          setLoading(false); // true → false: triggers re-render, clears spinner
        }
      } catch {
        setLoading(false);
      }
    }

    // Safety net: unblock after 2s regardless
    const timeout = setTimeout(() => setLoading(false), 2000);

    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      setUser(u);
      setLoading(false); // unblock UI immediately — Firestore ban check runs async
      if (u && !OWNER_UIDS.includes(u.uid)) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          setBanned(snap.exists() && snap.data()?.banned === true);
          // Ensure every user who can access the app has a Firestore doc.
          // Covers email users who verified but never hit a protected route,
          // and any other gap between Auth records and Firestore docs.
          if (!snap.exists() && canAccessApp(u)) {
            const profile = {
              displayName: u.displayName || deriveNameFromEmail(u.email || ""),
              photoURL: u.photoURL || "",
              email: u.email || "",
            };
            setDoc(doc(db, "users", u.uid), profile, { merge: true }).catch(() => {});
            setDoc(doc(db, "users", u.uid, "public", "profile"), profile, { merge: true }).catch(() => {});
          }
        } catch {
          setBanned(false);
        }
      } else {
        setBanned(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signOut, canAccess: canAccessApp(user), banned }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
