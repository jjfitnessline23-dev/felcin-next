export const dynamic = "force-dynamic";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { stripeSessionId } = body;
  if (!stripeSessionId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(stripeSessionId).catch(() => null);
  if (!session || session.payment_status !== "paid") return NextResponse.json({ error: "Payment not confirmed" }, { status: 400 });

  const { trainerId, traineeId, sessionDate, price } = session.metadata ?? {};
  if (!trainerId || !traineeId || traineeId !== uid) return NextResponse.json({ error: "Mismatch" }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const sessionDocId = `${traineeId}_${trainerId}_${Date.now()}`;
  await app.firestore().collection("trainingSessions").doc(sessionDocId).set({
    trainerId, traineeId, sessionDate,
    price: Number(price), stripeSessionId,
    status: "pending", exercises: "", notes: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, sessionId: sessionDocId });
}
