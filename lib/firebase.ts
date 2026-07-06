import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence, type Auth } from "firebase/auth";
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

// iOS WKWebView IndexedDB hangs silently — blocks onAuthStateChanged forever.
// Capacitor builds use browserLocalPersistence (localStorage) to avoid IndexedDB.
// Guard with typeof window so this doesn't throw during Next.js static generation.
const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";
let auth: Auth;
if (typeof window !== "undefined" && isCapacitorBuild) {
  try {
    auth = initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    auth = getAuth(app);
  }
} else {
  auth = getAuth(app);
}

let db: ReturnType<typeof getFirestore>;
if (typeof window !== "undefined") {
  try {
    // persistentLocalCache uses IndexedDB — hangs on iOS WKWebView.
    // Use memoryLocalCache for Capacitor builds (no offline persistence, but app loads).
    db = initializeFirestore(app, {
      localCache: isCapacitorBuild ? memoryLocalCache() : persistentLocalCache(),
    });
  } catch {
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);

export { app, auth, db, storage };
export const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];
