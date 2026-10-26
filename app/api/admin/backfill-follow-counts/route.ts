/**
 * One-time (re-runnable) backfill: recompute followersCount / followingCount for every
 * user from the actual followers/following subcollections.
 *
 * Needed because the old client-side counter increments were denied by rules, so existing
 * accounts have a stale/zero followersCount even though their follower relationships exist.
 * Without this, existing creators can never reach the 10K-follower creator-fund gate.
 *
 * Auth: EITHER the PAYOUT_SECRET bearer (the payout cron / curl) OR a signed-in owner's
 * Firebase ID token (the admin-panel button) — so the owner can run it in one tap
 * without handling the secret. Call once after deploy:
 *   curl -X POST https://felcin.com/api/admin/backfill-follow-counts \
 *        -H "authorization: Bearer $PAYOUT_SECRET"
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminApp, verifyToken } from "@/lib/firebaseAdmin";

const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.PAYOUT_SECRET;
  const secretOk = !!secret
    && auth.length === `Bearer ${secret}`.length
    && timingSafeEqual(Buffer.from(auth), Buffer.from(`Bearer ${secret}`));
  // Owner ID token also allowed (admin-panel one-tap).
  const callerUid = secretOk ? null : await verifyToken(auth);
  const ownerOk = !!callerUid && OWNER_UIDS.includes(callerUid);
  if (!secretOk && !ownerOk) {
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
