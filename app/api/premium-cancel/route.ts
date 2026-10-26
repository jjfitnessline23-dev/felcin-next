export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, verifyToken } from "@/lib/firebaseAdmin";

// Cancels the caller's Premium subscription at the end of the current period.
// Premium stays active until then; the daily reconcile cron ends it once Stripe
// reports the subscription as cancelled/unpaid.
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req.headers.get("authorization"));
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    const db = app.firestore();
    const premiumRef = db.collection("users").doc(uid).collection("settings").doc("premium");
    const snap = await premiumRef.get();
    const subId = snap.data()?.subscriptionId;
    if (!subId) return NextResponse.json({ error: "No active Premium subscription" }, { status: 400 });

    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    await premiumRef.set({ cancelAtPeriodEnd: true }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
