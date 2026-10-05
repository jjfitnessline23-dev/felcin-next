/**
 * One-time backfill: historical tip/ppv earnings were stored in DOLLARS (amountUsd =
 * creatorShare/100) before 2026-10-05, while the earnings UI treats amountUsd as CENTS.
 * This multiplies those old docs by 100 so they display correctly and the aggregated
 * total is right. New tip/ppv docs are already in cents and MUST NOT be touched — the
 * `cutoff` (ms epoch) excludes anything created at/after the fix.
 *
 * Secured with PAYOUT_SECRET. DRY RUN by default — reports what it would change.
 *   Dry run:  curl -X POST ".../api/admin/backfill-earnings-units" -H "authorization: Bearer $PAYOUT_SECRET"
 *   Apply:    curl -X POST ".../api/admin/backfill-earnings-units?apply=1&cutoff=<ms>" -H "authorization: Bearer $PAYOUT_SECRET"
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

  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  // Default cutoff = now (safe when run right after the fix deploy). Override with ?cutoff=<ms>.
  const cutoffMs = Number(url.searchParams.get("cutoff")) || Date.now();

  // All earnings across every user (collection group). Filter type in code to avoid a
  // collection-group index requirement.
  const snap = await db.collectionGroup("earnings").get();

  let tipPpvTotal = 0, eligible = 0, updated = 0;
  const samples: { id: string; type: string; amountUsd: number; createdMs: number | null }[] = [];
  const batchLimit = 450;
  let batch = db.batch(); let inBatch = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const type = data.type;
    if (type !== "tip" && type !== "ppv") continue;
    tipPpvTotal++;
    const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : null;
    // Only docs created before the cutoff (i.e. written in the old dollars format).
    if (createdMs !== null && createdMs >= cutoffMs) continue;
    const amt = typeof data.amountUsd === "number" ? data.amountUsd : 0;
    if (amt <= 0) continue;
    eligible++;
    if (samples.length < 20) samples.push({ id: d.id, type, amountUsd: amt, createdMs });
    if (apply) {
      batch.update(d.ref, { amountUsd: Math.round(amt * 100) });
      inBatch++; updated++;
      if (inBatch >= batchLimit) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
  }
  if (apply && inBatch > 0) await batch.commit();

  return NextResponse.json({
    ok: true,
    mode: apply ? "APPLIED" : "DRY_RUN",
    cutoffMs,
    totalEarningsScanned: snap.size,
    tipPpvDocs: tipPpvTotal,
    eligibleForBackfill: eligible,
    updated,
    samples,
  });
}
