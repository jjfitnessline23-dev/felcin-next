import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, getFirestore } from "firebase/firestore";
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
  // On Capacitor: skip initializeAuth() and initializeFirestore() entirely.
  // Both are handled by native @capacitor-firebase/* plugins via lib/db.ts and lib/auth.tsx.
  // Calling these triggers @firebase/installations which makes blocking URLSession
  // calls on iOS that cause the app to freeze on startup.
  // auth and db are null — all call sites on Capacitor use native plugins instead.
  auth = null as unknown as Auth;
  db = null as unknown as ReturnType<typeof getFirestore>;
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
