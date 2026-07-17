import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache, getFirestore, disableNetwork } from "firebase/firestore";
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

// Detect Capacitor by both the bridge object AND the URL scheme.
// The scheme check catches bundled builds where capacitor:// is used even
// if window.Capacitor races with module evaluation.
function detectCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  if (!!(window as any).Capacitor) return true;
  // Catch any custom Capacitor scheme (capacitor://, ionic://, felcin://, etc.)
  // by excluding standard web protocols. This is the critical fallback for bundled
  // iOS builds where the custom scheme name (e.g. "Felcin") differs from "capacitor".
  try { const p = window.location.protocol; return p !== "http:" && p !== "https:"; }
  catch { return false; }
}
const isCapacitor = detectCapacitor();

// Always use browserLocalPersistence — safe on all platforms and avoids the
// IndexedDB hang that WKWebView can cause when using the default persistence.
let auth: Auth;
try {
  auth = initializeAuth(app, { persistence: browserLocalPersistence });
} catch {
  // initializeAuth throws if already initialized — return the existing instance.
  auth = getAuth(app);
}

// Firestore cache: offline-capable persistent cache on all platforms.
//
// For Capacitor bundles (NEXT_PUBLIC_CAPACITOR_BUILD=true, baked at compile time):
//   - persistentSingleTabManager({ forceOwnership: true }) — skips multi-tab
//     IndexedDB coordination, which was the source of the WKWebView hang.
//   - experimentalAutoDetectLongPolling — avoids WebSocket + IndexedDB conflicts
//     on WKWebView. Together these give full offline persistence without the hang.
//
// For web: standard persistentLocalCache (offline support in browser).
let db: ReturnType<typeof getFirestore>;
if (typeof window !== "undefined") {
  const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";
  const cache = (isCapacitor || isCapacitorBuild)
    ? persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: true }) })
    : persistentLocalCache();
  try {
    db = initializeFirestore(app, { localCache: cache });
  } catch {
    db = getFirestore(app);
  }
  // Capacitor iOS: disable Firestore network immediately at startup.
  // WKWebView hangs when IndexedDB opens at the same time as network sync.
  // auth.tsx calls enableFirestoreNetwork() once the loading spinner is gone,
  // so Firestore syncs online data only after the app has fully rendered.
  if (isCapacitor || isCapacitorBuild) {
    disableNetwork(db).catch(() => {});
  }
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);

export { app, auth, db, storage };
export const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];
