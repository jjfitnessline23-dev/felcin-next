import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true" ? "force-static" : "force-dynamic";

const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";

const TIERS: Record<string, { name: string; amount: number }> = {
  basic: { name: "Basic Support (30 days)", amount: 399 },
  pro:   { name: "Pro Support (30 days)",   amount: 999 },
};

async function verifyFirebaseToken(idToken: string): Promise<string | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  const data = await res.json();
  return data?.users?.[0]?.localId ?? null;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  try {
    const { tier, creatorUid, creatorName = "Creator", token } = await req.json();
    const tierData = TIERS[tier];
    if (!tierData || !creatorUid || !token) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const buyerUid = await verifyFirebaseToken(token);
    if (!buyerUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const origin = req.headers.get("origin") || "https://felcin.com";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: { currency: "usd", unit_amount: tierData.amount, product_data: { name: `${tierData.name} — ${creatorName}` } }, quantity: 1 }],
      success_url: `${origin}/subscribe/${creatorUid}?sub_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/user-profile?uid=${creatorUid}`,
      metadata: { buyerUid, creatorUid, tier },
    });
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
