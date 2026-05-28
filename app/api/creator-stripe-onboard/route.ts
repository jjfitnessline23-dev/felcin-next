export const dynamic = "force-static";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";


const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";

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

  const { token, existingAccountId } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const uid = await verifyFirebaseToken(token);
  if (!uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  let accountId = existingAccountId || null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { felcinUid: uid },
    });
    accountId = account.id;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: "https://felcin.com/earnings?stripe_refresh=1",
    return_url: "https://felcin.com/earnings?stripe_success=1",
    type: "account_onboarding",
  });

  return NextResponse.json({ stripeAccountId: accountId, url: link.url });
}
