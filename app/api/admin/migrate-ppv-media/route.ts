export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import admin from "firebase-admin";

// One-off migration: existing PPV posts/reels store the real mediaUrl on the public post
// doc, so the paywall is bypassable by reading the doc. This moves each PPV post's mediaUrl
// into the gated subcollection users/{authorId}/ppvMedia/{postId} and blanks it on the doc
// (setting lockedMedia:true). Dry-run by default; pass ?apply=1 to actually migrate.
// Auth: Authorization: Bearer <PAYOUT_SECRET>.

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); return admin; }
  catch { return null; }
}

function authorized(req: NextRequest) {
  const secret = process.env.PAYOUT_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

async function run(dryRun: boolean): Promise<{ body: Record<string, unknown>; status: number }> {
  const app = getAdmin();
  if (!app) return { body: { error: "Firebase Admin not configured" }, status: 500 };
  const db = app.firestore();
  let scanned = 0, migrated = 0, skipped = 0;
  const samples: string[] = [];

  for (const col of ["posts", "reels"] as const) {
    const snap = await db.collection(col).where("ppvPrice", ">", 0).limit(2000).get();
    for (const d of snap.docs) {
      const data = d.data();
      const url = data.mediaUrl;
      if (!url || data.lockedMedia === true) { skipped++; continue; } // already migrated / no media
      if (!data.authorId) { skipped++; continue; }
      scanned++;
      if (!dryRun) {
        await db.doc(`users/${data.authorId}/ppvMedia/${d.id}`).set({
          mediaUrl: url,
          contentType: data.contentType ?? null,
          mimeType: data.mimeType ?? null,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await d.ref.update({ mediaUrl: "", lockedMedia: true });
      }
      migrated++;
      if (samples.length < 15) samples.push(`${col}/${d.id}`);
    }
  }
  return { body: { ok: true, dryRun, scanned, wouldMigrateOrMigrated: migrated, skipped, samples }, status: 200 };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await run(req.nextUrl.searchParams.get("apply") !== "1");
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await run(req.nextUrl.searchParams.get("apply") !== "1");
  return NextResponse.json(r.body, { status: r.status });
}
