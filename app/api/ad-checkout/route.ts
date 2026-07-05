export const dynamic = "force-dynamic";
import { verifyToken } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";


const AD_TIERS: Record<string, { label: string; price: number; impressions: number; days: number }> = {
  starter: { label: "Starter",  price: 2900,  impressions: 10_000,  days: 7  },
  growth:  { label: "Growth",   price: 7900,  impressions: 35_000,  days: 14 },
  pro:     { label: "Pro",      price: 19900, impressions: 100_000, days: 30 },
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { tier, title, adBody, mediaUrl, mediaType, linkUrl, token } = body;
  if (!tier || !title || !mediaUrl || !linkUrl || !token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const tierData = AD_TIERS[tier];
  if (!tierData) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  if (!await rateLimit(`ad:${uid}`, 5, 60_000)) {
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
          name: `Felcin Ad â€” ${tierData.label} (${tierData.impressions.toLocaleString()} impressions)`,
          description: `${tierData.days} days Â· ${tierData.impressions.toLocaleString()} guaranteed impressions`,
        },
      },
      quantity: 1,
    }],
    success_url: `https://felcin.com/advertise?ad_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://felcin.com/advertise`,
    metadata: {
      uid,
      tier,
      title: title.slice(0, 200),
      adBody: (adBody || "").slice(0, 400),
      mediaUrl: mediaUrl.slice(0, 500),
      mediaType: mediaType || "image",
      linkUrl: linkUrl.slice(0, 300),
      impressions: String(tierData.impressions),
      days: String(tierData.days),
      amountPaid: String(tierData.price),
    },
  });

  return NextResponse.json({ url: session.url });
}
