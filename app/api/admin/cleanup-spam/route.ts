export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import admin from "firebase-admin";

// Admin cleanup: remove off-topic / spam posts from the public feed (e.g. the
// "AI car negotiator #Drivoagent" post). Matches by hashtag or caption keyword.
// Dry-run by default; pass ?apply=1 to actually delete. Auth: Bearer <PAYOUT_SECRET>.
//
// Add more terms to KEYWORDS below to sweep future off-topic spam.
const KEYWORDS = ["drivoagent", "car negotiator", "ai car negotiator"];

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

function isSpam(data: FirebaseFirestore.DocumentData): boolean {
  const hay = `${data.caption ?? ""} ${data.text ?? ""} ${(Array.isArray(data.tags) ? data.tags.join(" ") : "")}`.toLowerCase();
  return KEYWORDS.some((k) => hay.includes(k));
}

async function run(dryRun: boolean): Promise<{ body: Record<string, unknown>; status: number }> {
  const app = getAdmin();
  if (!app) return { body: { error: "Firebase Admin not configured" }, status: 500 };
  const db = app.firestore();
  let scanned = 0, matched = 0;
  const samples: string[] = [];

  for (const col of ["posts", "reels"] as const) {
    const snap = await db.collection(col).orderBy("createdAt", "desc").limit(3000).get();
    for (const d of snap.docs) {
      scanned++;
      if (!isSpam(d.data())) continue;
      matched++;
      if (samples.length < 25) samples.push(`${col}/${d.id} — ${(d.data().caption ?? d.data().text ?? "").toString().slice(0, 60)}`);
      if (!dryRun) await d.ref.delete().catch(() => {});
    }
  }
  return { body: { ok: true, dryRun, scanned, matched, deleted: dryRun ? 0 : matched, keywords: KEYWORDS, samples }, status: 200 };
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
