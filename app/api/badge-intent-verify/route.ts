export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); return admin; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const { paymentIntentId } = await req.json().catch(() => ({}));
    if (!paymentIntentId) return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") return NextResponse.json({ ok: false, status: pi.status }, { status: 402 });

    const { uid, badgeId, badgeLabel } = pi.metadata ?? {};
    const app = getAdmin();
    if (app && uid && badgeId) {
      const db = app.firestore();
      await db.collection("users").doc(uid).set({ badge: badgeId, badgeLabel }, { merge: true });
      await db.collection("users").doc(uid).collection("public").doc("profile").set({ badge: badgeId, badgeLabel }, { merge: true });
    }

    return NextResponse.json({ ok: true, badgeId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
