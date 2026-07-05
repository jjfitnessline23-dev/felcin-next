export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";


const PLATFORM_FEE_PCT = 30;

const GIFTS: Record<string, { emoji: string; label: string; price: number }> = {
  rose:    { emoji: "ðŸŒ¹", label: "Rose",    price: 99 },
  heart:   { emoji: "â¤ï¸",  label: "Heart",   price: 99 },
  clap:    { emoji: "ðŸ‘", label: "Clap",    price: 99 },
  fire:    { emoji: "ðŸ”¥", label: "Fire",    price: 199 },
  star:    { emoji: "â­",  label: "Star",    price: 199 },
  rocket:  { emoji: "ðŸš€", label: "Rocket",  price: 299 },
  crown:   { emoji: "ðŸ‘‘", label: "Crown",   price: 499 },
  diamond: { emoji: "ðŸ’Ž", label: "Diamond", price: 999 },
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { giftType, streamId, hostId, token } = body;

  const gift = GIFTS[giftType];
  if (!gift) return NextResponse.json({ error: "Invalid gift type" }, { status: 400 });
  if (!streamId || !hostId || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const fromUid = await verifyToken(req.headers.get("authorization"));
  if (!fromUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  if (!await rateLimit(`gift:${fromUid}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests — slow down" }, { status: 429 });
  }
  if (fromUid === hostId) return NextResponse.json({ error: "Cannot gift yourself" }, { status: 400 });

  const platformFee = Math.round(gift.price * PLATFORM_FEE_PCT / 100);
  const creatorStripeId = await getCreatorStripeId(hostId);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `${gift.emoji} ${gift.label} Gift`,
          description: "Sent live on Felcin",
          images: ["https://felcin.com/favicon.ico"],
        },
        unit_amount: gift.price,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `https://felcin.com/live/${streamId}?gift_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://felcin.com/live/${streamId}`,
    metadata: {
      giftType,
      giftEmoji: gift.emoji,
      streamId,
      fromUid,
      hostId,
      priceUsd: String(gift.price),
      creatorShareUsd: String(gift.price - platformFee),
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
