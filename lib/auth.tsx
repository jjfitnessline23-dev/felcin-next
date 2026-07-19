"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "@/lib/db";
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

// Baked as compile-time constant — tree-shakes the unused branch in each build.
const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [banned, setBanned] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function handleUser(rawUser: {
      uid: string;
      email?: string | null;
      displayName?: string | null;
      photoUrl?: string | null;
      photoURL?: string | null;
      phoneNumber?: string | null;
      providerData?: { providerId: string }[];
    } | null) {
      if (!mounted) return;

      // Normalize native plugin user (photoUrl) vs web SDK user (photoURL)
      const u = rawUser
        ? ({
            uid: rawUser.uid,
            email: rawUser.email ?? null,
            emailVerified: (rawUser as any).emailVerified ?? false,
            displayName: rawUser.displayName ?? null,
            photoURL: rawUser.photoURL ?? rawUser.photoUrl ?? null,
            phoneNumber: rawUser.phoneNumber ?? null,
            providerData: (rawUser.providerData ?? []).map((p) => ({
              providerId: p.providerId,
              uid: rawUser.uid,
              displayName: null,
              email: rawUser.email ?? null,
              phoneNumber: null,
              photoURL: null,
            })),
          } as unknown as User)
        : null;

      setUser(u);
      setLoading(false);

      if (u && !OWNER_UIDS.includes(u.uid)) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (!mounted) return;
          setBanned(snap.exists() && snap.data()?.banned === true);
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
          if (mounted) setBanned(false);
        }
      } else {
        if (mounted) setBanned(false);
      }
    }

    if (IS_CAP_BUILD) {
      // Skip getCurrentUser() — it calls getIDTokenResult() which triggers a
      // native URLSession token refresh for expired tokens. iOS's default socket
      // timeout is 60 seconds; on a "semi-connected" network this hangs the app
      // until airplane mode kills the socket.
      //
      // addAuthStateChangeListener fires immediately from Keychain cache with no
      // network call, giving us the auth state in <50ms instead of 60 seconds.
      const capTimeout = setTimeout(() => { if (mounted) setLoading(false); }, 1000);

      import("@capacitor-firebase/authentication")
        .then(({ FirebaseAuthentication }) => {
          FirebaseAuthentication.addAuthStateChangeListener(({ user }) => {
            clearTimeout(capTimeout);
            handleUser(user);
          });
        })
        .catch(() => {
          clearTimeout(capTimeout);
          if (mounted) setLoading(false);
        });

      return () => { mounted = false; clearTimeout(capTimeout); };
    }

    // Web: use Firebase web SDK auth
    const timeout = setTimeout(() => { if (mounted) setLoading(false); }, 500);
    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timeout);
      handleUser(u);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  const signOut = async () => {
    if (IS_CAP_BUILD) {
      try {
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        await FirebaseAuthentication.signOut();
      } catch {}
      return; // auth is null on Capacitor — native plugin handles sign-out
    }
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
