export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 30;

const TIERS: Record<string, { name: string; amount: number }> = {
  basic: { name: "Basic Support (30 days)", amount: 399 },
  pro:   { name: "Pro Support (30 days)",   amount: 999 },
};

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
    const { tier, creatorUid, creatorName = "Creator", token } = await req.json();
    const tierData = TIERS[tier];
    if (!tierData || !creatorUid || !token) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const buyerUid = await verifyToken(req.headers.get("authorization"));
    if (!buyerUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    if (!await rateLimit(`sub-pi:${buyerUid}`, 5, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const platformFee = Math.round(tierData.amount * PLATFORM_FEE_PCT / 100);
    const creatorStripeId = await getCreatorStripeId(creatorUid);

    const params: Stripe.PaymentIntentCreateParams = {
      amount: tierData.amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { buyerUid, creatorUid, tier, creatorName },
    };
    if (creatorStripeId) {
      params.application_fee_amount = platformFee;
      params.transfer_data = { destination: creatorStripeId };
    }

    const pi = await stripe.paymentIntents.create(params);
    return NextResponse.json({ clientSecret: pi.client_secret, tierName: tierData.name, amount: tierData.amount });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
