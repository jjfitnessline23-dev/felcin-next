export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyToken } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

    const callerUid = await verifyToken(req.headers.get("authorization"));
    if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return NextResponse.json({ ok: false });

    const { buyerUid, creatorUid, tier } = session.metadata as Record<string, string>;
    if (buyerUid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({ ok: true, buyerUid, creatorUid, tier, amountCents: session.amount_total ?? 0 });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
