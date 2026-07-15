export const dynamic = "force-dynamic";
import { verifyToken } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";


const BOOST_TIERS: Record<string, { label: string; price: number; reach: number; days: number }> = {
  basic:    { label: "Basic",    price: 500,  reach: 1_000, days: 1 },
  standard: { label: "Standard", price: 1000, reach: 2_100, days: 1 },
  plus:     { label: "Plus",     price: 1500, reach: 3_680, days: 1 },
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { postId, tier, token } = body;
  if (!postId || !tier || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const tierData = BOOST_TIERS[tier];
  if (!tierData) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  if (!await rateLimit(`boost:${uid}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests â€” slow down" }, { status: 429 });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: tierData.price,
        product_data: {
          name: `${tierData.label} â€” ${tierData.reach.toLocaleString()} extra views`,
          description: `Your post reaches ${tierData.reach.toLocaleString()} more people over ${tierData.days} days`,
        },
      },
      quantity: 1,
    }],
    success_url: `https://felcin.com/?boost_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://felcin.com/`,
    metadata: { postId, tier, uid, reach: String(tierData.reach), days: String(tierData.days) },
  });

  return NextResponse.json({ url: session.url });
}
