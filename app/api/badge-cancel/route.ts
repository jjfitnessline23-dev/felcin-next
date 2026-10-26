export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, verifyToken } from "@/lib/firebaseAdmin";

// Cancels the caller's badge subscription at the end of the current period. The
// badge stays active until then; the daily reconcile cron clears it once Stripe
// reports the subscription as ended.
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req.headers.get("authorization"));
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    const db = app.firestore();
    const snap = await db.collection("users").doc(uid).get();
    const subId = snap.data()?.badgeSubscriptionId;
    if (!subId) return NextResponse.json({ error: "No active badge subscription" }, { status: 400 });

    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    await db.collection("users").doc(uid).set({ badgeCancelAtPeriodEnd: true }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
