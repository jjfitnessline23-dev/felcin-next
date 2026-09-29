export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId, getAdminApp } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

// Check whether a creator's Stripe account is fully onboarded
export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ connected: false });
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization") ?? token);
  if (!uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const accountId = await getCreatorStripeId(uid);
  if (!accountId) return NextResponse.json({ connected: false });

  try {
    const account = await stripe.accounts.retrieve(accountId);
    return NextResponse.json({
      connected: true,
      payoutsEnabled: account.payouts_enabled ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      accountId,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

// Create or resume Stripe Connect onboarding
export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { token } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  // Only ever resume the caller's OWN persisted account — never trust a client-supplied
  // account id (that let a caller open someone else's onboarding).
  let accountId = await getCreatorStripeId(uid);

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { felcinUid: uid },
    });
    accountId = account.id;
    // Persist it — payouts + every monetization read depend on this field, and without
    // it a brand-new orphan account was created on every visit.
    const app = getAdminApp();
    if (app) await app.firestore().doc(`users/${uid}/public/profile`).set({ stripeAccountId: accountId }, { merge: true });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: "https://felcin.com/earnings?stripe_refresh=1",
    return_url: "https://felcin.com/earnings?stripe_success=1",
    type: "account_onboarding",
  });

  return NextResponse.json({ stripeAccountId: accountId, url: link.url });
}
