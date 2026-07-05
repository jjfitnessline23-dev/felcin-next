export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ ok: false });
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false });

  const m = session.metadata as Record<string, string>;
  if (m.uid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    ok: true,
    uid: m.uid, tier: m.tier, title: m.title, adBody: m.adBody,
    mediaUrl: m.mediaUrl, mediaType: m.mediaType, linkUrl: m.linkUrl,
    impressions: parseInt(m.impressions), days: parseInt(m.days),
    amountPaid: parseInt(m.amountPaid), sessionId,
  });
}
