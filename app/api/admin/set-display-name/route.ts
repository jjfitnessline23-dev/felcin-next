export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { OWNER_UIDS } from "@/lib/firebase";

// Owner-only: sets the calling owner's display name across Auth + the root user
// doc + the public profile (what posts, comments, and podcasts read).
export async function POST(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid || !OWNER_UIDS.includes(uid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "Name must be 1–40 characters" }, { status: 400 });
  }

  try {
    await app.auth().updateUser(uid, { displayName: name }).catch(() => {});
    await app.firestore().doc(`users/${uid}`).set({ displayName: name }, { merge: true });
    await app.firestore().doc(`users/${uid}/public/profile`).set({ displayName: name }, { merge: true });
    return NextResponse.json({ ok: true, name });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || "Failed" }, { status: 500 });
  }
}
