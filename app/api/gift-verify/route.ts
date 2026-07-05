export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false, error: "Payment not completed" }, { status: 402 });

  const meta = session.metadata ?? {};
  if (meta.fromUid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    ok: true,
    giftType: meta.giftType ?? "",
    giftEmoji: meta.giftEmoji ?? "",
    streamId: meta.streamId ?? "",
    fromUid: meta.fromUid ?? "",
    hostId: meta.hostId ?? "",
    priceUsd: parseInt(meta.priceUsd ?? "0"),
    creatorShareUsd: parseInt(meta.creatorShareUsd ?? "0"),
    sessionId,
  });
}
