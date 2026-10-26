export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, verifyToken } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  // Subscription Checkout sessions report payment_status "paid" + status "complete"
  // once the first invoice is settled.
  if (session.payment_status !== "paid" && session.status !== "complete") return NextResponse.json({ ok: false }, { status: 402 });

  const { uid, badgeId, badgeLabel } = session.metadata ?? {};
  if (uid && uid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const app = getAdminApp();
  if (app && uid && badgeId) {
    const db = app.firestore();
    // Store the subscription id so the daily reconcile cron can remove the badge
    // when the subscription is cancelled or goes unpaid.
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    await db.collection("users").doc(uid).set({ badge: badgeId, badgeLabel, badgeActive: true, badgeSubscriptionId: subscriptionId, badgeCancelAtPeriodEnd: false }, { merge: true });
    await db.collection("users").doc(uid).collection("public").doc("profile").set({ badge: badgeId, badgeLabel }, { merge: true });
  }

  return NextResponse.json({ ok: true, uid, badgeId });
}
