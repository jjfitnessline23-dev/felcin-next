/**
 * Server-side follow / unfollow (creator-fund eligibility depends on this).
 *
 * The follower relationship docs were written client-side fine, but the denormalized
 * `followersCount` on the *followed* user is a cross-user write — denied by rules and
 * silently .catch-swallowed — so followersCount never grew. That counter gates the whole
 * creator fund (earnings page + payout cron both read `followersCount >= 10000`), the
 * explore ranking, and profile stats. This route does the whole thing with the Admin SDK
 * in a transaction so the relationship docs and both counters always stay in sync, and
 * only mutates counters when the relationship actually changes (idempotent — a double-tap
 * or retry can never double-count).
 */
export const dynamic = "force-dynamic";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { targetUid, action } = body;
  if (!targetUid || (action !== "follow" && action !== "unfollow")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const callerUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (callerUid === targetUid) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  if (!await rateLimit(`follow:${callerUid}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const db = app.firestore();

  const followerRef  = db.doc(`users/${targetUid}/followers/${callerUid}`);
  const followingRef = db.doc(`users/${callerUid}/following/${targetUid}`);
  const targetRef    = db.doc(`users/${targetUid}`);
  const callerRef    = db.doc(`users/${callerUid}`);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const inc = (n: number) => admin.firestore.FieldValue.increment(n);

  const changed = await db.runTransaction(async (tx) => {
    const exists = (await tx.get(followerRef)).exists;
    if (action === "follow") {
      if (exists) return false; // already following → no-op (idempotent)
      tx.set(followerRef,  { followerId: callerUid, createdAt: now });
      tx.set(followingRef, { followingId: targetUid, createdAt: now });
      tx.set(targetRef, { followersCount: inc(1) }, { merge: true });
      tx.set(callerRef, { followingCount: inc(1) }, { merge: true });
    } else {
      if (!exists) return false; // not following → no-op
      tx.delete(followerRef);
      tx.delete(followingRef);
      tx.set(targetRef, { followersCount: inc(-1) }, { merge: true });
      tx.set(callerRef, { followingCount: inc(-1) }, { merge: true });
    }
    return true;
  });

  return NextResponse.json({ ok: true, changed });
}
