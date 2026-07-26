export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false }, { status: 402 });

  const { uid, badgeId, badgeLabel } = session.metadata ?? {};
  const app = getAdminApp();
  if (app && uid && badgeId) {
    const db = app.firestore();
    await db.collection("users").doc(uid).set({ badge: badgeId, badgeLabel }, { merge: true });
    await db.collection("users").doc(uid).collection("public").doc("profile").set({ badge: badgeId, badgeLabel }, { merge: true });
  }

  return NextResponse.json({ ok: true, uid, badgeId });
}
