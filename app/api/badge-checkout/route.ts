import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true" ? "force-static" : "force-dynamic";

const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";

const TIERS: Record<string, { label: string; price: number; emoji: string }> = {
  bronze:  { label: "Bronze Badge",  price: 199,  emoji: "🥉" },
  silver:  { label: "Silver Badge",  price: 499,  emoji: "🥈" },
  gold:    { label: "Gold Badge",    price: 999,  emoji: "🥇" },
  diamond: { label: "Diamond Badge", price: 1999, emoji: "💎" },
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
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { tier, toUid, message = "", token, returnUrl = "https://felcin.com/badges" } = body;

  const tierData = TIERS[tier];
  if (!tierData) return NextResponse.json({ error: "Invalid badge tier" }, { status: 400 });
  if (!toUid || !token) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const fromUid = await verifyFirebaseToken(token);
  if (!fromUid) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  if (fromUid === toUid) return NextResponse.json({ error: "Cannot gift yourself" }, { status: 400 });

  const base = returnUrl.replace(/[/?]+$/, "");
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `${tierData.emoji} ${tierData.label}`,
          description: "Creator badge for Felcin · sent by a supporter",
          images: ["https://felcin.com/favicon.ico"],
        },
        unit_amount: tierData.price,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${base}?uid=${encodeURIComponent(toUid)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?uid=${encodeURIComponent(toUid)}`,
    metadata: {
      tier,
      fromUid,
      toUid,
      message: message.slice(0, 500),
    },
  });

  return NextResponse.json({ url: session.url });
}
