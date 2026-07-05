export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 20;

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { creatorUid, creatorName, amountCents, token } = body;
  if (!creatorUid || !amountCents || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (amountCents < 100 || amountCents > 100000) return NextResponse.json({ error: "Amount out of range" }, { status: 400 });

  const fromUid = await verifyToken(req.headers.get("authorization"));
  if (!fromUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await rateLimit(`tip:${fromUid}`, 5, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (fromUid === creatorUid) return NextResponse.json({ error: "Cannot tip yourself" }, { status: 400 });

  const platformFee = Math.round(amountCents * PLATFORM_FEE_PCT / 100);
  const creatorStripeId = await getCreatorStripeId(creatorUid);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ["card"],
    line_items: [{ price_data: { currency: "usd", product_data: { name: `Tip for ${creatorName}`, description: "Sent on Felcin" }, unit_amount: amountCents }, quantity: 1 }],
    mode: "payment",
    success_url: `https://felcin.com/user-profile?uid=${creatorUid}&tip_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://felcin.com/user-profile?uid=${creatorUid}`,
    metadata: { creatorUid, fromUid, amountCents: String(amountCents), creatorShare: String(amountCents - platformFee) },
  };

  if (creatorStripeId) {
    sessionParams.payment_intent_data = { application_fee_amount: platformFee, transfer_data: { destination: creatorStripeId } };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.json({ url: session.url });
}
