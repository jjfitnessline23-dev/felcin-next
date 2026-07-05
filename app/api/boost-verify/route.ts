export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ ok: false });
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false });

  const { postId, tier, uid, reach, days } = session.metadata as Record<string, string>;
  if (uid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const app = getAdminApp();
  if (app && postId) {
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + parseInt(days) * 86400000));
    await app.firestore().doc(`posts/${postId}`).update({
      boosted: true, boostExpiresAt: expiresAt, boostReach: parseInt(reach), boostTier: tier,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, postId, tier, uid, reach: parseInt(reach), days: parseInt(days), sessionId });
}
