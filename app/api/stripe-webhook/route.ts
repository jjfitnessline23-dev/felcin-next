/**
 * Stripe webhook endpoint — handles all payment completions.
 * Ensures badges/subs/tips activate even if the user closes the app
 * before the redirect-back verify flow completes.
 *
 * Register this URL in Stripe Dashboard → Webhooks:
 *   https://felcin.com/api/stripe-webhook
 * Events to listen for:
 *   checkout.session.completed      (activate badge/premium/sub purchases)
 *   payment_intent.succeeded        (activate embedded card-sheet purchases)
 *   customer.subscription.updated   (status change → end perks if no longer active)
 *   customer.subscription.deleted   (cancellation finalized → remove perks)
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
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
    db.collection("users").doc(uid).set({ badge: badgeId, badgeLabel, badgeActive: true }, { merge: true }),
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

// Write a creator earnings-ledger entry. Deterministic id (= the session/PI id) makes it
// idempotent, so the redirect-verify route and the webhook can both run for a Checkout
// payment without double-recording. amountUsd is in CENTS (the earnings UI divides by 100),
// and the sort field MUST be `timestamp`.
async function writeEarning(creatorUid: string, sessionId: string, fields: Record<string, unknown>) {
  const app = getAdminApp();
  if (!app || !creatorUid || !sessionId) return;
  await app.firestore().collection("users").doc(creatorUid).collection("earnings").doc(sessionId).set(
    { ...fields, source: "webhook", timestamp: new Date() }, { merge: true }
  );
}

// Shared core — works for both Checkout sessions and direct PaymentIntents (embedded
// card sheet). A PaymentIntent that originated from a Checkout Session has no metadata
// (it lives on the session), so processing both events never double-counts.
async function handlePayment(meta: Record<string, string>, amount: number, sessionId: string, source: "session" | "pi" = "session") {
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
    // Write the creator's earnings ledger entry SERVER-SIDE (idempotent via sessionId).
    // Previously this was done client-side, so a closed tab/flaky network lost the row
    // even though Stripe transferred the money. Creator share = total − 30% platform fee.
    await writeEarning(meta.creatorUid, sessionId, {
      type: "subscription", fromUid: meta.buyerUid, tier, amountUsd: amount - Math.round(amount * 0.30),
    });
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
    // Embedded card-sheet tips (PaymentIntent) have no redirect, so tip-verify never runs
    // and the creator's earnings ledger would miss them. Record it here. Checkout tips
    // (source "session") are left to tip-verify to avoid a double entry.
    if (source === "pi") {
      await writeEarning(meta.creatorUid, sessionId, { type: "tip", fromUid: meta.fromUid, amountUsd: amount - Math.round(amount * 0.20) });
    }
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
    // Write the recipient creator's earnings ledger SERVER-SIDE (idempotent via sessionId).
    // gift-checkout sets the recipient as `hostId` and the share as `creatorShareUsd`.
    const giftRecipient = meta.recipientUid || meta.hostId;
    if (giftRecipient) {
      await writeEarning(giftRecipient, sessionId, {
        type: "gift",
        fromUid: meta.fromUid ?? meta.senderUid,
        giftType: meta.giftType,
        giftEmoji: meta.giftEmoji,
        amountUsd: meta.creatorShareUsd ? parseInt(meta.creatorShareUsd, 10) : amount - Math.round(amount * 0.30),
      });
    }
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

async function handleSession(session: Stripe.Checkout.Session) {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const subId = typeof session.subscription === "string" ? session.subscription : null;

  // Monthly badge / Premium subscriptions (badge-subscribe / premium-checkout):
  // persist the subscription id so the lifecycle events + reconcile cron can manage
  // it, and activate Premium here as a backstop if the redirect-verify never ran.
  if (subId && meta.uid) {
    const app = getAdminApp();
    if (app) {
      const db = app.firestore();
      if (meta.badgeId) {
        await db.collection("users").doc(meta.uid).set(
          { badgeActive: true, badgeSubscriptionId: subId, badgeCancelAtPeriodEnd: false }, { merge: true });
      } else if (meta.plan) { // Premium
        await Promise.all([
          db.collection("users").doc(meta.uid).collection("settings").doc("premium").set(
            { active: true, plan: meta.plan, subscriptionId: subId, cancelAtPeriodEnd: false, grantedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
          db.collection("users").doc(meta.uid).set({ premium: true, premiumSubscriptionId: subId }, { merge: true }),
          db.collection("users").doc(meta.uid).collection("public").doc("profile").set({ premium: true }, { merge: true }),
        ]);
        const email = await getUserEmail(meta.uid);
        if (email) await sendEmail(email, "Felcin Premium activated", premiumConfirmationEmail(meta.plan, (session.amount_total ?? 0) / 100));
      }
    }
  }

  await handlePayment(meta, session.amount_total ?? 0, session.id, "session");
}

// Subscription lifecycle: a badge/Premium subscription changed state. When it's no
// longer active (cancelled at period end, unpaid after retries, etc.) we remove the
// perk immediately — the reconcile cron is the daily backstop; this is the instant path.
const ACTIVE_SUB_STATES = new Set(["active", "trialing", "past_due"]); // past_due = Stripe still retrying → keep perks

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const meta = (sub.metadata ?? {}) as Record<string, string>;
  const uid = meta.uid;
  if (!uid) return; // not one of ours (no metadata)
  if (ACTIVE_SUB_STATES.has(sub.status)) return; // still entitled

  const app = getAdminApp();
  if (!app) return;
  const db = app.firestore();
  const del = admin.firestore.FieldValue.delete();

  if (meta.kind === "badge" || meta.badgeId) {
    await Promise.all([
      db.collection("users").doc(uid).set({ badge: del, badgeLabel: del, badgeActive: false }, { merge: true }),
      db.collection("users").doc(uid).collection("public").doc("profile").set({ badge: del, badgeLabel: del }, { merge: true }),
    ]);
  } else if (meta.kind === "premium" || meta.plan) {
    await Promise.all([
      db.collection("users").doc(uid).collection("settings").doc("premium").set({ active: false }, { merge: true }),
      db.collection("users").doc(uid).set({ premium: false }, { merge: true }),
      db.collection("users").doc(uid).collection("public").doc("profile").set({ premium: false }, { merge: true }),
    ]);
  }
}

async function handlePaymentIntent(pi: Stripe.PaymentIntent) {
  // Only direct PIs (tip/subscribe/badge via the embedded card sheet) carry metadata;
  // Checkout-originated PIs have none → no-op, so no double processing.
  await handlePayment((pi.metadata ?? {}) as Record<string, string>, pi.amount ?? 0, pi.id, "pi");
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
  } else if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    // In prod the secret MUST be set — never process unsigned (forgeable) events.
    console.error("STRIPE_WEBHOOK_SECRET not set in production — rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  } else {
    // Local dev only — process unsigned events but log a warning.
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev)");
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
  } else if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await handlePaymentIntent(pi).catch((e) =>
      console.error("Webhook PI handler error:", e.message)
    );
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await handleSubscriptionChange(sub).catch((e) =>
      console.error("Webhook subscription handler error:", e.message)
    );
  }

  return NextResponse.json({ received: true });
}
