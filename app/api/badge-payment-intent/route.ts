export const dynamic = "force-dynamic";
import { verifyToken } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";


const BADGE_PRICES: Record<string, { label: string; priceCents: number; emoji: string }> = {
  verified:      { label: "Verified Badge",      priceCents: 299,  emoji: "✅" },
  creator:       { label: "Creator Badge",        priceCents: 499,  emoji: "🎨" },
  fitness_coach: { label: "Fitness Coach Badge",  priceCents: 999,  emoji: "🏋️" },
  pro:           { label: "Pro Creator Badge",    priceCents: 1299, emoji: "⭐" },
  athlete:       { label: "Athlete Badge",        priceCents: 1499, emoji: "🏆" },
  star:          { label: "Star Creator Badge",   priceCents: 1999, emoji: "🌟" },
  brand:         { label: "Brand Badge",          priceCents: 2999, emoji: "🏢" },
  elite:         { label: "Elite Badge",          priceCents: 4999, emoji: "💎" },
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
    if (!await rateLimit(`badge-pi:${uid}`, 3, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: badge.priceCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { uid, badgeId, badgeLabel: badge.label },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, badgeLabel: badge.label, amount: badge.priceCents });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
