export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import Stripe from "stripe";

// Daily reconciliation for recurring purchases (badges + Premium). Checkout verify
// grants access up front; this job is what REMOVES it. For every user holding a
// badge or Premium subscription, it asks Stripe for the live subscription status
// and clears the badge / ends Premium once the subscription is no longer active
// (cancelled, unpaid, or past its period end). Without this, a cancelled
// subscription would keep its perks forever.

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

const ACTIVE = new Set(["active", "trialing", "past_due"]); // past_due = Stripe still retrying; keep perks

function stripeClient() {
  return new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function reconcile(): Promise<{ body: Record<string, unknown>; status: number }> {
  const app = getAdmin();
  if (!app) return { body: { error: "Firebase not configured" }, status: 500 };
  if (!process.env.STRIPE_SECRET_KEY) return { body: { error: "Stripe not configured" }, status: 500 };
  const db = app.firestore();
  const stripe = stripeClient();
  let badgesChecked = 0, badgesCleared = 0, premiumChecked = 0, premiumEnded = 0;

  // ── Badges ──
  const badgeSnap = await db.collection("users").where("badgeActive", "==", true).limit(500).get();
  for (const d of badgeSnap.docs) {
    const subId = d.data().badgeSubscriptionId;
    badgesChecked++;
    if (!subId) continue; // legacy one-time badge (no subscription) — leave it alone
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (!ACTIVE.has(sub.status)) {
        await d.ref.set({ badge: admin.firestore.FieldValue.delete(), badgeLabel: admin.firestore.FieldValue.delete(), badgeActive: false }, { merge: true });
        await db.collection("users").doc(d.id).collection("public").doc("profile").set({ badge: admin.firestore.FieldValue.delete(), badgeLabel: admin.firestore.FieldValue.delete() }, { merge: true });
        badgesCleared++;
      }
    } catch { /* subscription not found → treat as gone */
      await d.ref.set({ badgeActive: false }, { merge: true });
    }
  }

  // ── Premium ──
  const premiumSnap = await db.collection("users").where("premium", "==", true).limit(500).get();
  for (const d of premiumSnap.docs) {
    premiumChecked++;
    const premiumRef = db.collection("users").doc(d.id).collection("settings").doc("premium");
    const premiumDoc = await premiumRef.get();
    const subId = premiumDoc.data()?.subscriptionId;
    if (!subId) continue; // legacy / manually-granted premium — leave it alone
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (!ACTIVE.has(sub.status)) {
        await premiumRef.set({ active: false }, { merge: true });
        await d.ref.set({ premium: false }, { merge: true });
        await db.collection("users").doc(d.id).collection("public").doc("profile").set({ premium: false }, { merge: true });
        premiumEnded++;
      }
    } catch {
      await premiumRef.set({ active: false }, { merge: true });
      await d.ref.set({ premium: false }, { merge: true });
    }
  }

  return { body: { ok: true, badgesChecked, badgesCleared, premiumChecked, premiumEnded }, status: 200 };
}

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return !!secret && authHeader === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await reconcile();
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await reconcile();
  return NextResponse.json(r.body, { status: r.status });
}
