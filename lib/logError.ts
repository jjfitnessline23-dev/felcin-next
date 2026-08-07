import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export function logError(source: string, error: unknown) {
  if (!db) return;
  const user = auth?.currentUser;
  const err = error as any;
  addDoc(collection(db, "errorLogs"), {
    source,
    message: err?.message ?? String(error),
    code: err?.code ?? null,
    userId: user?.uid ?? null,
    userEmail: user?.email ?? null,
    page: typeof window !== "undefined" ? window.location.pathname : null,
    timestamp: serverTimestamp(),
  }).catch(() => {});
}
