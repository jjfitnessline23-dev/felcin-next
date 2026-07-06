"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
  getRedirectResult,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, OWNER_UIDS } from "./firebase";

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
  return !!user.email && user.emailVerified;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [banned, setBanned] = useState(false);
  // On Capacitor: show loading only if a Firebase token exists in localStorage
  // (avoids flash to login when user is already signed in, but doesn't block new users)
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    if (!(window as any).Capacitor) return true;
    const hasCachedUser = Object.keys(localStorage).some(k => k.startsWith("firebase:authUser:"));
    return hasCachedUser;
  });

  useEffect(() => {
    // Skip getRedirectResult in Capacitor — redirects never work in WebViews,
    // calling it delays onAuthStateChanged even with browserLocalPersistence
    if (process.env.NEXT_PUBLIC_CAPACITOR_BUILD !== "true") {
      getRedirectResult(auth).catch(() => {});
    }

    // Safety net: if onAuthStateChanged doesn't fire within 6s, unblock the UI
    const timeout = setTimeout(() => setLoading(false), 6000);

    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      setUser(u);
      setLoading(false); // unblock UI immediately — Firestore ban check runs async
      if (u && !OWNER_UIDS.includes(u.uid)) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          setBanned(snap.exists() && snap.data()?.banned === true);
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
