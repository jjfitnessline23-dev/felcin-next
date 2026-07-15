export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 30;

const TIERS: Record<string, { label: string; price: number; emoji: string }> = {
  bronze:  { label: "Bronze Badge",  price: 199,  emoji: "ðŸ¥‰" },
  silver:  { label: "Silver Badge",  price: 499,  emoji: "ðŸ¥ˆ" },
  gold:    { label: "Gold Badge",    price: 999,  emoji: "ðŸ¥‡" },
  diamond: { label: "Diamond Badge", price: 1999, emoji: "ðŸ’Ž" },
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { tier, toUid, message = "", token, returnUrl = "https://felcin.com/badges" } = body;

  const tierData = TIERS[tier];
  if (!tierData) return NextResponse.json({ error: "Invalid badge tier" }, { status: 400 });
  if (!toUid || !token) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const fromUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!fromUid) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  if (!await rateLimit(`badge:${fromUid}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests â€” slow down" }, { status: 429 });
  }
  if (fromUid === toUid) return NextResponse.json({ error: "Cannot gift yourself" }, { status: 400 });

  const platformFee = Math.round(tierData.price * PLATFORM_FEE_PCT / 100);
  const creatorStripeId = await getCreatorStripeId(toUid);

  const base = returnUrl.replace(/[/?]+$/, "");
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `${tierData.emoji} ${tierData.label}`,
          description: "Creator badge for Felcin Â· sent by a supporter",
          images: ["https://felcin.com/favicon.ico"],
        },
        unit_amount: tierData.price,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${base}?uid=${encodeURIComponent(toUid)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?uid=${encodeURIComponent(toUid)}`,
    metadata: {
      tier,
      fromUid,
      toUid,
      message: message.slice(0, 500),
      priceUsd: String(tierData.price),
      creatorShareUsd: String(tierData.price - platformFee),
    },
  };

  if (creatorStripeId) {
    sessionParams.payment_intent_data = {
      application_fee_amount: platformFee,
      transfer_data: { destination: creatorStripeId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.json({ url: session.url });
}
