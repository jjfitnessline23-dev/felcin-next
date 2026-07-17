import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, memoryLocalCache, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE",
  authDomain: "felcin.firebaseapp.com",
  projectId: "felcin",
  storageBucket: "felcin.firebasestorage.app",
  messagingSenderId: "989891719192",
  appId: "1:989891719192:web:1266786c201c87f4c8536d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function detectCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  if (!!(window as any).Capacitor) return true;
  try { const p = window.location.protocol; return p !== "http:" && p !== "https:"; }
  catch { return false; }
}
const isCapacitor = detectCapacitor();

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    // Required for signInWithPopup — initializeAuth does not set this automatically
    // unlike getAuth(). Omitting it causes auth/argument-error on web Google sign-in.
    popupRedirectResolver: typeof window !== "undefined" ? browserPopupRedirectResolver : undefined,
  });
} catch {
  auth = getAuth(app);
}

// Firestore: memoryLocalCache for Capacitor bundles, persistentLocalCache for web.
// iOS WKWebView has a WebKit bug: IndexedDB + active network = deadlock that blocks
// ALL JavaScript (including setTimeout). memoryLocalCache avoids IndexedDB entirely.
// NEXT_PUBLIC_CAPACITOR_BUILD is baked as a compile-time constant by Next.js so
// this selection is resolved at build time with no runtime detection needed.
let db: ReturnType<typeof getFirestore>;
if (typeof window !== "undefined") {
  const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";
  const cache = (isCapacitor || isCapacitorBuild) ? memoryLocalCache() : persistentLocalCache();
  try {
    db = initializeFirestore(app, { localCache: cache });
  } catch {
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);

export { app, auth, db, storage };
export const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];
