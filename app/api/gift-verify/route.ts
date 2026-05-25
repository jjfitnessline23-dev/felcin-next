import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ ok: false, error: "Payment not completed" }, { status: 402 });
  }

  const meta = session.metadata ?? {};
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
