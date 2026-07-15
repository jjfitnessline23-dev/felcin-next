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
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: p.label, description: "No ads - Premium badge - Early access to new features" },
          unit_amount: p.amount,
          recurring: { interval: p.interval },
        },
        quantity: 1,
      }],
      mode: "subscription",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ui_mode: "embedded" as any,
      return_url: `https://felcin.com/?premium_session_id={CHECKOUT_SESSION_ID}`,
      metadata: { uid, plan },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
