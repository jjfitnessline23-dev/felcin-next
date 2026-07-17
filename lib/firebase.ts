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

const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    // Capacitor uses native sign-in — no redirect flows, no popup resolver needed.
    // Passing browserPopupRedirectResolver on Capacitor makes Auth check for a pending
    // redirect result on every startup, adding async work before onAuthStateChanged fires.
    popupRedirectResolver: IS_CAP_BUILD ? undefined : (typeof window !== "undefined" ? browserPopupRedirectResolver : undefined),
  });
} catch {
  auth = getAuth(app);
}

// Firestore cache:
// - Capacitor bundle: memoryLocalCache — avoids IndexedDB entirely.
//   iOS WKWebView deadlocks when IndexedDB.open() runs while network is active.
//   There is no JS-level workaround; disableNetwork() still triggers IndexedDB.
//   Offline persistence requires @capacitor-firebase/firestore (native SDK).
// - Web: persistentLocalCache — IndexedDB works fine in desktop/mobile browsers.
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
