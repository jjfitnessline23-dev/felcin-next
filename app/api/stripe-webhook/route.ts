/**
 * Stripe webhook endpoint — handles all payment completions.
 * Ensures badges/subs/tips activate even if the user closes the app
 * before the redirect-back verify flow completes.
 *
 * Register this URL in Stripe Dashboard → Webhooks:
 *   https://felcin.com/api/stripe-webhook
 * Events to listen for:
 *   checkout.session.completed
 *   payment_intent.succeeded
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminApp } from "@/lib/firebaseAdmin";
import {
  getUserEmail, sendEmail,
  badgeConfirmationEmail, subscriptionConfirmationEmail,
  tipConfirmationEmail, ppvConfirmationEmail,
  giftConfirmationEmail, boostConfirmationEmail,
  premiumConfirmationEmail, trainingSessionConfirmationEmail, adConfirmationEmail,
} from "@/lib/emailTemplates";

function getStripe() {
  return new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function activateBadge(uid: string, badgeId: string, badgeLabel: string) {
  const app = getAdminApp();
  if (!app || !uid || !badgeId) return;
  const db = app.firestore();
  await Promise.all([
    db.collection("users").doc(uid).set({ badge: badgeId, badgeLabel }, { merge: true }),
    db.collection("users").doc(uid).collection("public").doc("profile").set({ badge: badgeId, badgeLabel }, { merge: true }),
  ]);
}

async function activateSubscription(buyerUid: string, creatorUid: string, tier: string, sessionId: string) {
  const app = getAdminApp();
  if (!app || !buyerUid || !creatorUid) return;
  const db = app.firestore();
  await db.collection("users").doc(creatorUid).collection("subscribers").doc(buyerUid).set({
    uid: buyerUid, tier, stripeSessionId: sessionId, subscribedAt: new Date(), active: true,
  }, { merge: true });
}

async function recordPayment(type: string, meta: Record<string, string>, amountCents: number, sessionId: string) {
  const app = getAdminApp();
  if (!app) return;
  const db = app.firestore();
  await db.collection("payments").add({
    type, sessionId, amountCents, ...meta, createdAt: new Date(), source: "webhook",
  });
}

async function handleSession(session: Stripe.Checkout.Session) {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const amount = session.amount_total ?? 0;
  const sessionId = session.id;

  const usd = amount / 100;

  // ── Badge purchase (badge-purchase / badge-checkout routes) ──
  if (meta.badgeId && meta.uid) {
    const label = meta.badgeLabel ?? meta.badgeId;
    await activateBadge(meta.uid, meta.badgeId, label);
    await recordPayment("badge", meta, amount, sessionId);
    const email = await getUserEmail(meta.uid);
    if (email) await sendEmail(email, `Your ${label} badge is now live on Felcin`, badgeConfirmationEmail(label, meta.badgeId, usd));
    return;
  }

  // ── Badge (old badge-checkout with tier/fromUid/toUid) ──
  if (meta.tier && meta.fromUid && meta.toUid) {
    await recordPayment("badge_checkout", meta, amount, sessionId);
    const email = await getUserEmail(meta.fromUid);
    if (email) await sendEmail(email, `Your ${meta.tier} badge is now live on Felcin`, badgeConfirmationEmail(meta.tier, meta.tier, usd));
    return;
  }

  // ── Subscription ──
  if (meta.buyerUid && meta.creatorUid) {
    const tier = meta.tier ?? "standard";
    await activateSubscription(meta.buyerUid, meta.creatorUid, tier, sessionId);
    await recordPayment("subscription", meta, amount, sessionId);
    const [email, creatorSnap] = await Promise.all([
      getUserEmail(meta.buyerUid),
      getAdminApp()?.firestore().collection("users").doc(meta.creatorUid).get(),
    ]);
    const creatorName = creatorSnap?.data()?.displayName ?? creatorSnap?.data()?.username ?? "the creator";
    if (email) await sendEmail(email, `You're subscribed to ${creatorName} on Felcin`, subscriptionConfirmationEmail(creatorName, tier, usd));
    return;
  }

  // ── Tip ──
  if (meta.fromUid && meta.creatorUid) {
    await recordPayment("tip", meta, amount, sessionId);
    const [email, creatorSnap] = await Promise.all([
      getUserEmail(meta.fromUid),
      getAdminApp()?.firestore().collection("users").doc(meta.creatorUid).get(),
    ]);
    const creatorName = creatorSnap?.data()?.displayName ?? creatorSnap?.data()?.username ?? "the creator";
    if (email) await sendEmail(email, `Your tip to ${creatorName} was delivered`, tipConfirmationEmail(creatorName, usd));
    return;
  }

  // ── PPV ──
  if (meta.postId && meta.fromUid) {
    const app = getAdminApp();
    if (app && meta.fromUid && meta.postId) {
      await app.firestore()
        .collection(meta.col ?? "posts").doc(meta.postId)
        .collection("ppvUnlocks").doc(meta.fromUid)
        .set({ unlockedAt: new Date(), sessionId }, { merge: true });
    }
    await recordPayment("ppv", meta, amount, sessionId);
    const [email, creatorSnap] = await Promise.all([
      getUserEmail(meta.fromUid),
      meta.creatorUid ? getAdminApp()?.firestore().collection("users").doc(meta.creatorUid).get() : Promise.resolve(undefined),
    ]);
    const creatorName = creatorSnap?.data()?.displayName ?? creatorSnap?.data()?.username ?? "a creator";
    if (email) await sendEmail(email, "Your Felcin content is unlocked", ppvConfirmationEmail(creatorName, usd));
    return;
  }

  // ── Gift ──
  if (meta.giftType || meta.recipientUid) {
    await recordPayment("gift", meta, amount, sessionId);
    const fromUid = meta.fromUid ?? meta.senderUid;
    const [email, recipientSnap] = await Promise.all([
      fromUid ? getUserEmail(fromUid) : Promise.resolve(null),
      meta.recipientUid ? getAdminApp()?.firestore().collection("users").doc(meta.recipientUid).get() : Promise.resolve(undefined),
    ]);
    const recipientName = recipientSnap?.data()?.displayName ?? recipientSnap?.data()?.username ?? "someone";
    if (email) await sendEmail(email, "Your Felcin gift was delivered", giftConfirmationEmail(recipientName, usd));
    return;
  }

  // ── Boost / Ad / Premium / Training ── record generically
  if (meta.boostType || meta.adType || meta.premiumTier || meta.trainingSessionId) {
    const type = meta.boostType ? "boost" : meta.adType ? "ad" : meta.premiumTier ? "premium" : "training";
    await recordPayment(type, meta, amount, sessionId);
    const uid = meta.uid ?? meta.fromUid;
    const email = uid ? await getUserEmail(uid) : null;
    if (email) {
      if (type === "boost")    await sendEmail(email, "Your Felcin post boost is live", boostConfirmationEmail(usd));
      if (type === "ad")       await sendEmail(email, "Your Felcin ad campaign is live", adConfirmationEmail(usd));
      if (type === "premium")  await sendEmail(email, "Felcin Premium activated", premiumConfirmationEmail(meta.premiumTier!, usd));
      if (type === "training") {
        const trainerSnap = meta.trainerUid ? await getAdminApp()?.firestore().collection("users").doc(meta.trainerUid).get() : undefined;
        const trainerName = trainerSnap?.data()?.displayName ?? trainerSnap?.data()?.username ?? "your trainer";
        await sendEmail(email, `Training session booked with ${trainerName}`, trainingSessionConfirmationEmail(trainerName, usd));
      }
    }
    return;
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body         = await req.text();
  const sig          = req.headers.get("stripe-signature") ?? "";

  const stripe = getStripe();
  let event: Stripe.Event;

  if (webhookSecret) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (e: any) {
      console.error("Webhook signature failed:", e.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // No secret set — still process (dev mode) but log a warning
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    try { event = JSON.parse(body); }
    catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      await handleSession(session).catch((e) =>
        console.error("Webhook handler error:", e.message)
      );
    }
  }

  return NextResponse.json({ received: true });
}
