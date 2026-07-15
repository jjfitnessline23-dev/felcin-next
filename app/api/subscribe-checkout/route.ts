export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId, getCreatorFollowersCount, MONETIZATION_FOLLOWER_THRESHOLD } from "@/lib/firebaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 30;

const TIERS: Record<string, { name: string; amount: number }> = {
  basic: { name: "Basic Support (30 days)", amount: 399 },
  pro:   { name: "Pro Support (30 days)",   amount: 999 },
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  try {
    const { tier, creatorUid, creatorName = "Creator", token } = await req.json();
    const tierData = TIERS[tier];
    if (!tierData || !creatorUid || !token) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const buyerUid = await verifyToken(req.headers.get("authorization") ?? token);
    if (!buyerUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    if (!await rateLimit(`subscribe:${buyerUid}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const followers = await getCreatorFollowersCount(creatorUid);
    if (followers < MONETIZATION_FOLLOWER_THRESHOLD) return NextResponse.json({ error: "Creator not eligible for monetization" }, { status: 403 });

    const platformFee = Math.round(tierData.amount * PLATFORM_FEE_PCT / 100);
    const creatorStripeId = await getCreatorStripeId(creatorUid);

    const origin = req.headers.get("origin") || "https://felcin.com";
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [{ price_data: { currency: "usd", unit_amount: tierData.amount, product_data: { name: `${tierData.name} - ${creatorName}` } }, quantity: 1 }],
      success_url: `${origin}/subscribe/${creatorUid}?sub_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/user-profile?uid=${creatorUid}`,
      metadata: { buyerUid, creatorUid, tier },
    };

    if (creatorStripeId) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: { destination: creatorStripeId },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
