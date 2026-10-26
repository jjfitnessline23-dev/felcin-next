export const dynamic = "force-dynamic";
import { verifyToken } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";


const PLANS: Record<string, { label: string; amount: number; interval: "month" | "year" }> = {
  monthly: { label: "Felcin Premium - Monthly", amount: 999,  interval: "month" },
  yearly:  { label: "Felcin Premium - Yearly",  amount: 7999, interval: "year"  },
};

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { plan, token } = body;
    if (!plan || !token || !PLANS[plan]) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const uid = await verifyToken(req.headers.get("authorization") ?? body?.token);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await rateLimit(`premium:${uid}`, 3, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const p = PLANS[plan];
    // Hosted Stripe Checkout (session.url) — the proven-working flow in this app
    // (the gift-badge route uses it). The old embedded flow (client_secret) was
    // erroring and silently returning no checkout. On return, /settings reads
    // ?premium_session_id and calls /api/premium-verify to grant Premium.
    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: p.label, description: "No ads · Premium badge · Early access to new features" },
          unit_amount: p.amount,
          recurring: { interval: p.interval },
        },
        quantity: 1,
      }],
      mode: "subscription",
      success_url: `https://felcin.com/settings?premium_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://felcin.com/settings`,
      metadata: { app: "felcin", uid, plan },
      subscription_data: { metadata: { app: "felcin", uid, plan, kind: "premium" } },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
