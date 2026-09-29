export const dynamic = "force-dynamic";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, verifyToken } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const callerUid = await verifyToken(req.headers.get("authorization"));
    if (!callerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const { paymentIntentId } = await req.json().catch(() => ({}));
    if (!paymentIntentId) return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") return NextResponse.json({ ok: false, status: pi.status }, { status: 402 });

    const { uid, badgeId, badgeLabel } = pi.metadata ?? {};
    if (uid && uid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const app = getAdminApp();
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
