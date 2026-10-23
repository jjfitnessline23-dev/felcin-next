export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// Publishes posts/reels that were scheduled for a future time. The composer writes
// them with status:"scheduled" + a scheduledAt timestamp, and the feed hides
// anything still "scheduled" — so without this job a scheduled post would only ever
// show on the author's own profile and NEVER reach the feed. This flips due items to
// "published" and re-dates createdAt to the intended time so they land in the feed
// correctly (they were created with createdAt = the moment they were scheduled, which
// can be much earlier than the publish time).

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

async function publishDue(): Promise<{ body: Record<string, unknown>; status: number }> {
  const app = getAdmin();
  if (!app) return { body: { error: "Firebase not configured" }, status: 500 };
  const db = app.firestore();
  const now = admin.firestore.Timestamp.now();
  let posts = 0, reels = 0, scanned = 0;

  // Equality-only query (no composite index needed); filter the time window in code.
  for (const col of ["posts", "reels"] as const) {
    const snap = await db.collection(col).where("status", "==", "scheduled").limit(300).get();
    for (const d of snap.docs) {
      scanned++;
      const schedAt = d.data().scheduledAt as admin.firestore.Timestamp | null | undefined;
      // Not due yet → leave it scheduled.
      if (schedAt && schedAt.toMillis() > now.toMillis()) continue;
      await d.ref.update({
        status: "published",
        createdAt: schedAt ?? now, // re-date to the intended publish time
        publishedAt: now,
      }).catch(() => {});
      if (col === "posts") posts++; else reels++;
    }
  }
  return { body: { ok: true, scanned, posts, reels }, status: 200 };
}

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return !!secret && authHeader === `Bearer ${secret}`;
}

// Vercel Cron invokes the path with GET (and the CRON_SECRET bearer token); POST is
// kept for manual/consistency with the other cron routes.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await publishDue();
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await publishDue();
  return NextResponse.json(r.body, { status: r.status });
}
