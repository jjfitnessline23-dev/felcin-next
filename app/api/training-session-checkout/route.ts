export const dynamic = "force-dynamic";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 20;

async function getTrainerData(uid: string): Promise<{ stripeAccountId?: string; displayName?: string; ratePerSession?: number } | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await app.firestore().doc(`trainerProfiles/${uid}`).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    return { stripeAccountId: d.stripeAccountId, displayName: d.displayName, ratePerSession: d.ratePerSession };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { trainerId, sessionDate, token, returnUrl = "https://felcin.com/training-sessions" } = body;
  if (!trainerId || !sessionDate || !token) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const traineeId = await verifyToken(req.headers.get("authorization"));
  if (!traineeId) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  if (!await rateLimit(`training:${traineeId}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (traineeId === trainerId) return NextResponse.json({ error: "Cannot book yourself" }, { status: 400 });

  const trainer = await getTrainerData(trainerId);
  if (!trainer || !trainer.ratePerSession) return NextResponse.json({ error: "Trainer not found or has no rate set" }, { status: 400 });

  const price = trainer.ratePerSession;
  const platformFee = Math.round(price * PLATFORM_FEE_PCT / 100);
  const base = returnUrl.replace(/[/?]+$/, "");

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Training Session with ${trainer.displayName || "Trainer"}`,
          description: `Felcin personal training — ${new Date(sessionDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
          images: ["https://felcin.com/favicon.ico"],
        },
        unit_amount: price,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${base}?trainer=${encodeURIComponent(trainerId)}&date=${encodeURIComponent(sessionDate)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}`,
    metadata: {
      trainerId,
      traineeId,
      sessionDate,
      price: String(price),
      platformFee: String(platformFee),
    },
  };

  if (trainer.stripeAccountId) {
    sessionParams.payment_intent_data = {
      application_fee_amount: platformFee,
      transfer_data: { destination: trainer.stripeAccountId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.json({ url: session.url });
}
