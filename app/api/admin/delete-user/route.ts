/**
 * Admin cascade user-delete. The admin panel used to delete only the user's root doc +
 * public profile client-side, leaving their posts/reels/podcasts, their subcollections,
 * and their follow edges on OTHER users orphaned (stale followersCount, ghost authors on
 * old content). This route (owner-verified, Admin SDK) removes:
 *   - authored content: posts, reels, podcasts, ghostWorkouts (recursively, incl. their subcollections)
 *   - reciprocal follow edges on other users + the matching followersCount/followingCount decrements
 *   - the user doc itself and ALL its subcollections (recursiveDelete)
 *
 * NOT removed (bounded on purpose — note for future): individual comments the user left
 * on other people's posts/reels (scattered across subcollections) and chat messages. Those
 * are cosmetic leftovers, not access/security issues.
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];

export async function POST(req: NextRequest) {
  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid || !OWNER_UIDS.includes(callerUid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const targetUid: string | undefined = body?.targetUid;
  if (!targetUid) return NextResponse.json({ error: "Missing targetUid" }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const db = app.firestore();

  const summary = { posts: 0, reels: 0, podcasts: 0, ghostWorkouts: 0, followingEdges: 0, followerEdges: 0 };

  // 1. Authored content — recursiveDelete each so their comment/subcollection trees go too.
  for (const [col, field, key] of [
    ["posts", "authorId", "posts"],
    ["reels", "authorId", "reels"],
    ["podcasts", "hostId", "podcasts"],
    ["ghostWorkouts", "hostId", "ghostWorkouts"],
  ] as const) {
    const snap = await db.collection(col).where(field, "==", targetUid).get();
    for (const d of snap.docs) {
      await db.recursiveDelete(d.ref);
      summary[key]++;
    }
  }

  // 2a. This user was following others → remove their follower entry on each target and
  //     decrement that target's followersCount.
  const followingSnap = await db.collection(`users/${targetUid}/following`).get();
  for (const d of followingSnap.docs) {
    const targetId = d.id;
    await db.doc(`users/${targetId}/followers/${targetUid}`).delete().catch(() => {});
    await db.doc(`users/${targetId}`).set(
      { followersCount: admin.firestore.FieldValue.increment(-1) }, { merge: true }
    ).catch(() => {});
    summary.followingEdges++;
  }

  // 2b. Others were following this user → remove their following mirror + decrement their followingCount.
  const followersSnap = await db.collection(`users/${targetUid}/followers`).get();
  for (const d of followersSnap.docs) {
    const followerId = d.id;
    await db.doc(`users/${followerId}/following/${targetUid}`).delete().catch(() => {});
    await db.doc(`users/${followerId}`).set(
      { followingCount: admin.firestore.FieldValue.increment(-1) }, { merge: true }
    ).catch(() => {});
    summary.followerEdges++;
  }

  // 3. The user doc + every subcollection (public/profile, bookmarks, following, followers,
  //    settings, workoutLogs, monthlyViews, …) in one recursive sweep.
  await db.recursiveDelete(db.doc(`users/${targetUid}`));

  return NextResponse.json({ ok: true, targetUid, deleted: summary });
}
