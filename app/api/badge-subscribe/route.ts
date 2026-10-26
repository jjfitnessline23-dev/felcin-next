export const dynamic = "force-dynamic";
import { verifyToken } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

// Self-purchasable profile badges — billed as a MONTHLY subscription (hosted Stripe
// Checkout, session.url). On return, /badges reads ?badge_session_id and calls
// /api/badge-purchase-verify to activate the badge + store the subscription id.
// Keep these prices in sync with the cards on app/(protected)/badges/page.tsx.
const BADGE_PRICES: Record<string, { label: string; priceCents: number }> = {
  verified:      { label: "Verified Badge",     priceCents: 299 },
  creator:       { label: "Creator Badge",      priceCents: 499 },
  fitness_coach: { label: "Fitness Coach Badge", priceCents: 999 },
  pro:           { label: "Pro Creator Badge",   priceCents: 1299 },
  athlete:       { label: "Athlete Badge",       priceCents: 1499 },
  star:          { label: "Star Creator Badge",  priceCents: 1999 },
  brand:         { label: "Brand Badge",         priceCents: 2999 },
  elite:         { label: "Elite Badge",         priceCents: 4999 },
};

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { badgeId } = body;
    const badge = BADGE_PRICES[badgeId];
    if (!badge) return NextResponse.json({ error: "Invalid badge" }, { status: 400 });

    const uid = await verifyToken(req.headers.get("authorization") ?? body?.token);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await rateLimit(`badge-sub:${uid}`, 3, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: badge.label, description: "Felcin profile badge · renews monthly until cancelled" },
          unit_amount: badge.priceCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      mode: "subscription",
      success_url: `https://felcin.com/badges?badge_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://felcin.com/badges`,
      metadata: { app: "felcin", uid, badgeId, badgeLabel: badge.label },
      subscription_data: { metadata: { app: "felcin", uid, badgeId, badgeLabel: badge.label, kind: "badge" } },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
