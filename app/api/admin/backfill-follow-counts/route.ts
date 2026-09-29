/**
 * One-time (re-runnable) backfill: recompute followersCount / followingCount for every
 * user from the actual followers/following subcollections.
 *
 * Needed because the old client-side counter increments were denied by rules, so existing
 * accounts have a stale/zero followersCount even though their follower relationships exist.
 * Without this, existing creators can never reach the 10K-follower creator-fund gate.
 *
 * Secured with the same PAYOUT_SECRET as the payout cron. Call once after deploy:
 *   curl -X POST https://felcin.com/api/admin/backfill-follow-counts \
 *        -H "authorization: Bearer $PAYOUT_SECRET"
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  const secret = process.env.PAYOUT_SECRET;
  if (!secret) return NextResponse.json({ error: "Endpoint not configured" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
  const db = app.firestore();

  const usersSnap = await db.collection("users").get();
  let updated = 0;
  const errors: string[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    try {
      const [followers, following] = await Promise.all([
        db.collection(`users/${uid}/followers`).count().get(),
        db.collection(`users/${uid}/following`).count().get(),
      ]);
      await db.doc(`users/${uid}`).set({
        followersCount: followers.data().count,
        followingCount: following.data().count,
      }, { merge: true });
      updated++;
    } catch (e: unknown) {
      errors.push(`${uid}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, usersScanned: usersSnap.size, updated, errors });
}
