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

  const { postId, col, authorId, fromUid, priceCents } = session.metadata ?? {};
  if (fromUid !== callerUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const priceCentsNum = parseInt(priceCents ?? "0");
  const creatorShare = priceCentsNum - Math.round(priceCentsNum * PLATFORM_FEE_PCT / 100);

  const app = getAdminApp();
  if (app && postId && fromUid) {
    const db = app.firestore();
    const purchaseRef = db.collection(col || "posts").doc(postId).collection("purchases").doc(fromUid);
    const existing = await purchaseRef.get();
    if (!existing.exists) {
      await purchaseRef.set({ fromUid, sessionId, priceCents: priceCentsNum, unlockedAt: admin.firestore.FieldValue.serverTimestamp() });
      if (authorId) {
        await db.collection("users").doc(authorId).collection("earnings").add({
          type: "ppv", fromUid, postId, amountUsd: creatorShare / 100,
          sessionId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  return NextResponse.json({ ok: true, postId, fromUid });
}
