export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId, getCreatorFollowersCount, MONETIZATION_FOLLOWER_THRESHOLD } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 20;

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { postId, postCol, authorId, authorName, priceCents, caption, token } = body;
    if (!postId || !authorId || !priceCents || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const fromUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
    if (!fromUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await rateLimit(`ppv:${fromUid}`, 5, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (fromUid === authorId) return NextResponse.json({ error: "Cannot purchase own post" }, { status: 400 });

    // Parallel Firestore reads
    const [followers, creatorStripeId] = await Promise.all([
      getCreatorFollowersCount(authorId),
      getCreatorStripeId(authorId),
    ]);
    if (followers < MONETIZATION_FOLLOWER_THRESHOLD) return NextResponse.json({ error: "Creator not eligible for monetization" }, { status: 403 });
    if (!creatorStripeId) return NextResponse.json({ error: "Creator has not connected a payout account" }, { status: 402 });

    const platformFee = Math.round(priceCents * PLATFORM_FEE_PCT / 100);
    const col = postCol || "posts";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price_data: { currency: "usd", product_data: { name: `Unlock post by ${authorName}`, description: caption ? caption.slice(0, 100) : "Exclusive content on Felcin" }, unit_amount: priceCents }, quantity: 1 }],
      mode: "payment",
      success_url: `https://felcin.com/comments?postId=${postId}&col=${col}&ppv_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://felcin.com/`,
      metadata: { postId, col, authorId, fromUid, priceCents: String(priceCents), creatorShare: String(priceCents - platformFee) },
      payment_intent_data: { application_fee_amount: platformFee, transfer_data: { destination: creatorStripeId } },
    });
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
