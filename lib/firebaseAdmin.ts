import admin from "firebase-admin";

export function getAdminApp(): admin.app.App | null {
  if (admin.apps.length) return admin.apps[0]!;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    return admin.initializeApp({
      credential:    admin.credential.cert(JSON.parse(sa)),
      storageBucket: "felcin.firebasestorage.app",
    });
  } catch { return null; }
}

export async function verifyToken(authHeader: string | null | undefined): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const decoded = await app.auth().verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

export async function getCreatorStripeId(uid: string): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await app.firestore().doc(`users/${uid}/public/profile`).get();
    return snap.data()?.stripeAccountId ?? null;
  } catch { return null; }
}

export async function getCreatorFollowersCount(uid: string): Promise<number> {
  const app = getAdminApp();
  if (!app) return 0;
  try {
    const snap = await app.firestore().doc(`users/${uid}`).get();
    return snap.data()?.followersCount ?? 0;
  } catch { return 0; }
}

export const MONETIZATION_FOLLOWER_THRESHOLD = 10_000;
