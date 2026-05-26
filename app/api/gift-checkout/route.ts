import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true" ? "force-static" : "force-dynamic";

const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";
const FIREBASE_PROJECT_ID = "felcin";
const PLATFORM_FEE_PCT = 30;

const GIFTS: Record<string, { emoji: string; label: string; price: number }> = {
  rose:    { emoji: "🌹", label: "Rose",    price: 99 },
  heart:   { emoji: "❤️",  label: "Heart",   price: 99 },
  clap:    { emoji: "👏", label: "Clap",    price: 99 },
  fire:    { emoji: "🔥", label: "Fire",    price: 199 },
  star:    { emoji: "⭐",  label: "Star",    price: 199 },
  rocket:  { emoji: "🚀", label: "Rocket",  price: 299 },
  crown:   { emoji: "👑", label: "Crown",   price: 499 },
  diamond: { emoji: "💎", label: "Diamond", price: 999 },
};

async function verifyFirebaseToken(idToken: string): Promise<string | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  const data = await res.json();
  return data?.users?.[0]?.localId ?? null;
}

async function getCreatorStripeId(hostId: string): Promise<string | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${hostId}/public/profile?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.fields?.stripeAccountId?.stringValue ?? null;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { giftType, streamId, hostId, token } = body;

  const gift = GIFTS[giftType];
  if (!gift) return NextResponse.json({ error: "Invalid gift type" }, { status: 400 });
  if (!streamId || !hostId || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const fromUid = await verifyFirebaseToken(token);
  if (!fromUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
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
