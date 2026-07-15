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
    if (!await rateLimit(`badge-purchase:${uid}`, 3, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // Try embedded checkout first; fall back to hosted redirect if not supported
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${badge.emoji} ${badge.label}`, description: "Badge displayed on your Felcin profile" },
            unit_amount: badge.priceCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ui_mode: "embedded" as any,
        return_url: `https://felcin.com/badges?badge_session_id={CHECKOUT_SESSION_ID}`,
        metadata: { uid, badgeId, badgeLabel: badge.label },
      });
      return NextResponse.json({ clientSecret: session.client_secret });
    } catch {
      // Fall back to hosted checkout (redirect)
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${badge.emoji} ${badge.label}`, description: "Badge displayed on your Felcin profile" },
            unit_amount: badge.priceCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `https://felcin.com/badges?badge_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://felcin.com/badges`,
        metadata: { uid, badgeId, badgeLabel: badge.label },
      });
      return NextResponse.json({ url: session.url });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
