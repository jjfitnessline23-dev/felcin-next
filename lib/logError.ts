import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// Writes a client-side error to the `errorLogs` collection (admin/bot-readable
// per firestore.rules) so failures that would otherwise be swallowed by a
// try/catch are diagnosable. Pass `extra` to attach context the web-SDK auth
// can't provide — e.g. on Capacitor builds `auth.currentUser` is null, so the
// caller should pass the uid from useAuth().
export function logError(
  source: string,
  error: unknown,
  extra?: { uid?: string | null; email?: string | null } & Record<string, unknown>,
) {
  if (!db) return;
  const user = auth?.currentUser;
  const err = error as any;
  const { uid, email, ...rest } = extra ?? {};
  addDoc(collection(db, "errorLogs"), {
    source,
    message: err?.message ?? String(error),
    code: err?.code ?? null,
    userId: uid ?? user?.uid ?? null,
    userEmail: email ?? user?.email ?? null,
    page: typeof window !== "undefined" ? window.location.pathname : null,
    timestamp: serverTimestamp(),
    ...rest,
  }).catch(() => {});
}
