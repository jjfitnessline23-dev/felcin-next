export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { OWNER_UIDS } from "@/lib/firebase";

// One-time (idempotent) backfill: writes a denormalized authorName + authorPhoto
// onto every post/reel that is missing it, so the feed never has to do a second
// per-author Firestore read. Safe to run repeatedly — it skips docs that already
// carry a name. Owner-only.

async function profileFor(
  db: FirebaseFirestore.Firestore,
  uid: string,
  cache: Map<string, { name: string; photo: string }>,
): Promise<{ name: string; photo: string }> {
  const hit = cache.get(uid);
  if (hit) return hit;
  let out = { name: "User", photo: "" };
  try {
    const pub = await db.doc(`users/${uid}/public/profile`).get();
    if (pub.exists) {
      const d = pub.data()!;
      out = { name: d.displayName || d.username || "User", photo: d.photoURL || "" };
    } else {
      const root = await db.doc(`users/${uid}`).get();
      if (root.exists) {
        const d = root.data()!;
        out = { name: d.displayName || d.username || "User", photo: d.photoURL || "" };
      }
    }
  } catch {}
  cache.set(uid, out);
  return out;
}

async function backfillCollection(
  db: FirebaseFirestore.Firestore,
  col: string,
  scanLimit: number,
  cache: Map<string, { name: string; photo: string }>,
): Promise<{ scanned: number; updated: number; skipped: number }> {
  const snap = await db.collection(col).orderBy("createdAt", "desc").limit(scanLimit).get();
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    // Already denormalized — nothing to do.
    if (data.authorName && String(data.authorName).trim()) { skipped++; continue; }
    const authorId = data.authorId as string | undefined;
    if (!authorId) { skipped++; continue; }
    const prof = await profileFor(db, authorId, cache);
    batch.set(doc.ref, { authorName: prof.name, authorPhoto: prof.photo }, { merge: true });
    updated++;
    inBatch++;
    if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
  }
  if (inBatch > 0) await batch.commit();
  return { scanned: snap.size, updated, skipped };
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid || !OWNER_UIDS.includes(uid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = getAdminApp();
  if (!app) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const scanLimit: number = Math.min(Math.max(Number(body?.scanLimit) || 1500, 1), 3000);

  const db = app.firestore();
  const cache = new Map<string, { name: string; photo: string }>();

  try {
    const posts = await backfillCollection(db, "posts", scanLimit, cache);
    const reels = await backfillCollection(db, "reels", scanLimit, cache);
    return NextResponse.json({
      ok: true,
      posts,
      reels,
      uniqueAuthorsResolved: cache.size,
      note: "Idempotent — safe to run again. Raise scanLimit (max 3000) to cover older posts.",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || "Backfill failed" }, { status: 500 });
  }
}
