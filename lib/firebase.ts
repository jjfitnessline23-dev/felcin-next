import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache, getFirestore, disableNetwork, enableNetwork } from "firebase/firestore";
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

// Firestore offline strategy for Capacitor iOS bundle:
//
// iOS WKWebView deadlocks when IndexedDB.open() and network I/O run concurrently.
// Fix: disable network at startup so IndexedDB opens without interference, then
// re-enable after 2s (IndexedDB.open() always completes within ~100ms offline).
//
//   t=0ms   — init with persistentLocalCache, disableNetwork() called
//   t=0ms   — IndexedDB opens clean, app loads from cache (works online & offline)
//   t=2000ms — enableNetwork() fires, Firestore syncs server data, UI updates live
//
// Web: standard persistentLocalCache with no network manipulation needed.
let db: ReturnType<typeof getFirestore>;
if (typeof window !== "undefined") {
  const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";
  const isCapacitorEnv = isCapacitor || isCapacitorBuild;
  const cache = isCapacitorEnv
    ? persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: true }) })
    : persistentLocalCache();
  try {
    db = initializeFirestore(app, { localCache: cache });
  } catch {
    db = getFirestore(app);
  }
  if (isCapacitorEnv) {
    disableNetwork(db).catch(() => {});
    setTimeout(() => enableNetwork(db).catch(() => {}), 2000);
  }
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);

export { app, auth, db, storage };
export const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];
