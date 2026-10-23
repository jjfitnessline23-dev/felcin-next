export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import Stripe from "stripe";
import admin from "firebase-admin";

const RATE_CENTS_PER_1K = 40;      // $0.40 per 1,000 views
const MIN_MONTHLY_VIEWS = 100_000; // must hit 100K views in the month to qualify
const MIN_FOLLOWERS = 10_000;
const MIN_PAYOUT_CENTS = 100;      // $1.00 minimum transfer

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

function prevMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Vercel Cron invokes the path with GET (Authorization: Bearer $CRON_SECRET), so GET
// must be handled or the monthly payout job 405s and never runs. Delegate to POST.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  // Accept EITHER the manual PAYOUT_SECRET or Vercel Cron's CRON_SECRET. Endpoint is
  // closed if neither is configured. (Payout is idempotent per month via monthlyViews.paid.)
  const payoutSecret = process.env.PAYOUT_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!payoutSecret && !cronSecret) {
    console.error("Neither PAYOUT_SECRET nor CRON_SECRET configured — endpoint disabled");
    return NextResponse.json({ error: "Endpoint not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  // Timing-safe comparison against each configured secret.
  const ok = [payoutSecret, cronSecret]
    .filter((s): s is string => !!s)
    .map((s) => `Bearer ${s}`)
    .some((expected) =>
      auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    );
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const a = getAdmin();
  if (!a) return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });

  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const db = a.firestore();
  const month = prevMonth();

  // Query creators with enough followers — limit to 1000 to avoid full collection scan
  const usersSnap = await db.collection("users").where("followersCount", ">=", MIN_FOLLOWERS).limit(1000).get();

  const results: { uid: string; status: string; payout?: number }[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();

    // Get Stripe account ID from public profile
    const profileSnap = await db.doc(`users/${uid}/public/profile`).get();
    const stripeAccountId: string | undefined = profileSnap.data()?.stripeAccountId;
    if (!stripeAccountId) {
      results.push({ uid, status: "skipped_no_stripe" });
      continue;
    }

    // Get monthly view count
    const mvSnap = await db.doc(`users/${uid}/monthlyViews/${month}`).get();
    if (!mvSnap.exists) {
      results.push({ uid, status: "skipped_no_views" });
      continue;
    }
    const mvData = mvSnap.data()!;
    if (mvData.paid === true) {
      results.push({ uid, status: "already_paid" });
      continue;
    }
    const views: number = mvData.views ?? 0;
    if (views < MIN_MONTHLY_VIEWS) {
      results.push({ uid, status: "skipped_under_100k" });
      continue;
    }
    const payoutCents = Math.floor(views / 1000) * RATE_CENTS_PER_1K;
    if (payoutCents < MIN_PAYOUT_CENTS) {
      results.push({ uid, status: "skipped_below_minimum" });
      continue;
    }

    try {
      // Transfer from platform balance to creator's Express account
      const transfer = await stripe.transfers.create({
        amount: payoutCents,
        currency: "usd",
        destination: stripeAccountId,
        metadata: { month, viewCount: String(views), creatorUid: uid, type: "creator_fund" },
      });

      // Record in earnings
      await db.collection(`users/${uid}/earnings`).add({
        type: "views",
        month,
        views,
        amountUsd: payoutCents,
        stripeTransferId: transfer.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mark month as paid
      await db.doc(`users/${uid}/monthlyViews/${month}`).update({ paid: true, paidAt: admin.firestore.FieldValue.serverTimestamp() });

      results.push({ uid, status: "paid", payout: payoutCents });
    } catch (e: unknown) {
      results.push({ uid, status: `error: ${(e as Error).message}` });
    }
  }

  return NextResponse.json({ month, processed: results.length, results });
}
