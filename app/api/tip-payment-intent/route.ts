export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 20;

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { creatorUid, creatorName, amountCents, token } = body;
    if (!creatorUid || !amountCents || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (amountCents < 100 || amountCents > 100000) return NextResponse.json({ error: "Amount out of range" }, { status: 400 });

    const fromUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
    if (!fromUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await rateLimit(`tip-pi:${fromUid}`, 5, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (fromUid === creatorUid) return NextResponse.json({ error: "Cannot tip yourself" }, { status: 400 });

    const platformFee = Math.round(amountCents * PLATFORM_FEE_PCT / 100);
    const creatorStripeId = await getCreatorStripeId(creatorUid);

    const params: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { creatorUid, fromUid, amountCents: String(amountCents), creatorName: creatorName || "Creator" },
    };
    if (creatorStripeId) {
      params.application_fee_amount = platformFee;
      params.transfer_data = { destination: creatorStripeId };
    }

    const pi = await stripe.paymentIntents.create(params);
    return NextResponse.json({ clientSecret: pi.client_secret, amount: amountCents });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
