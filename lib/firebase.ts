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
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    // On Capacitor, sign-in is handled by the native @capacitor-firebase/authentication
    // plugin. No redirect flows are used, so no popup resolver is needed.
    popupRedirectResolver: IS_CAP_BUILD
      ? undefined
      : typeof window !== "undefined"
      ? browserPopupRedirectResolver
      : undefined,
  });
} catch {
  auth = getAuth(app);
}

// On Capacitor: memoryLocalCache — lib/db.ts routes all Firestore calls to the
// native plugin anyway, so this instance is only used as a reference object.
// On web: persistentLocalCache — IndexedDB works fine in desktop/mobile browsers.
let db: ReturnType<typeof getFirestore>;
if (typeof window !== "undefined") {
  try {
    db = initializeFirestore(app, {
      localCache: IS_CAP_BUILD ? memoryLocalCache() : persistentLocalCache(),
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
