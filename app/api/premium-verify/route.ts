export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({});
  const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid" && session.status !== "complete") return NextResponse.json({ ok: false }, { status: 402 });

  const { uid, plan } = session.metadata ?? {};
  if (uid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const app = getAdminApp();
  if (app && uid) {
    const db = app.firestore();
    const premiumRef = db.collection("users").doc(uid).collection("settings").doc("premium");
    const existing = await premiumRef.get();
    if (!existing.exists || existing.data()?.sessionId !== sessionId) {
      const expiresAt = plan === "yearly"
        ? new Date(Date.now() + 365 * 24 * 3600 * 1000)
        : new Date(Date.now() + 31 * 24 * 3600 * 1000);
      await premiumRef.set({ active: true, plan, sessionId, expiresAt, grantedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection("users").doc(uid).set({ premium: true }, { merge: true });
      await db.collection("users").doc(uid).collection("public").doc("profile").set({ premium: true }, { merge: true });
    }
  }

  return NextResponse.json({ ok: true, uid, plan });
}
