export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

const PLATFORM_FEE_PCT = 20;

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false }, { status: 402 });

  const { creatorUid, fromUid, amountCents } = session.metadata ?? {};
  if (fromUid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const amountCentsNum = parseInt(amountCents ?? "0");
  const platformFee = Math.round(amountCentsNum * PLATFORM_FEE_PCT / 100);
  const creatorShare = amountCentsNum - platformFee;

  const app = getAdminApp();
  if (app && creatorUid && fromUid) {
    const db = app.firestore();
    const tipRef = db.collection("users").doc(creatorUid).collection("tips").doc(sessionId);
    const existing = await tipRef.get();
    if (!existing.exists) {
      await tipRef.set({ fromUid, amountCents: amountCentsNum, creatorShare, sessionId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection("users").doc(creatorUid).collection("earnings").add({
        type: "tip", fromUid, amountUsd: creatorShare / 100,
        sessionId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  return NextResponse.json({ ok: true, creatorUid, fromUid, amountCents: amountCentsNum });
}
