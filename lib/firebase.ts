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

// Compile-time constants baked into each bundle by Next.js.
const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";
// ios → native plugins (avoids WKWebView IndexedDB hang on iOS)
// android → web SDK (Android WebView IndexedDB is fine; gives persistent offline cache)
const IS_IOS_BUILD = process.env.NEXT_PUBLIC_PLATFORM === "ios";

let auth: Auth;
let db: ReturnType<typeof getFirestore>;

if (IS_CAP_BUILD && IS_IOS_BUILD && typeof window !== "undefined") {
  // iOS Capacitor only: skip web SDK entirely.
  // Native @capacitor-firebase/* plugins handle auth + Firestore.
  // initializeFirestore() triggers @firebase/installations → blocking URLSession
  // calls on iOS that freeze the app at startup.
  auth = null as unknown as Auth;
  db = null as unknown as ReturnType<typeof getFirestore>;
} else {
  // Web, SSR, or Android Capacitor: web Firebase SDK.
  // Android WebView supports IndexedDB — persistentLocalCache() survives app restarts.
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
