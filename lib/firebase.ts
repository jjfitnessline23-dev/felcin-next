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

// Compile-time constant — Next.js bakes this into the bundle so the unused branch
// is tree-shaken. Never use runtime window.Capacitor detection for config decisions.
const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

let auth: Auth;
let db: ReturnType<typeof getFirestore>;

if (IS_CAP_BUILD && typeof window !== "undefined") {
  // On Capacitor: skip initializeAuth() — handled by native @capacitor-firebase/authentication.
  // initializeAuth with browserLocalPersistence triggers @firebase/installations URLSession
  // calls that block the iOS main thread and freeze the app on startup.
  auth = null as unknown as Auth;

  // Pre-initialize Firestore with memory-only cache (no IndexedDB).
  // All actual reads/writes go through the native @capacitor-firebase/firestore plugin
  // in lib/db.ts (IS_CAP=true path). However, that plugin's JS web-fallback internally
  // calls getFirestore() — which would otherwise create a fresh IndexedDB-backed instance.
  // IndexedDB in WKWebView is unreliable and crashes with assertion b815:
  //   "Attempt to get a record from database without an in-progress transaction"
  // Pre-initializing with memoryLocalCache() makes getFirestore() return this safe
  // in-memory instance instead, eliminating the crash entirely.
  try {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    db = getFirestore(app);
  }
} else {
  // SSR or web browser: full web SDK initialization
  try {
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: typeof window !== "undefined" ? browserPopupRedirectResolver : undefined,
    });
  } catch {
    auth = getAuth(app);
  }
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
  } catch {
    db = getFirestore(app);
  }
}

const storage = getStorage(app);

export { app, auth, db, storage };
export const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];
