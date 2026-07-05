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
  const [loading, setLoading] = useState(true);
  const [banned, setBanned] = useState(false);

  useEffect(() => {
    // Clear any stale redirect state — safe no-op when using browserLocalPersistence
    getRedirectResult(auth).catch(() => {});
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
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
      setLoading(false);
    });
    return unsub;
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
