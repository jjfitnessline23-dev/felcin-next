export const dynamic = "force-dynamic";
import { verifyToken, getCreatorStripeId, getCreatorFollowersCount, MONETIZATION_FOLLOWER_THRESHOLD } from "@/lib/firebaseAdmin";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const PLATFORM_FEE_PCT = 30;

const GIFTS: Record<string, { emoji: string; label: string; price: number }> = {
  // Tier 1 — $0.99
  rose:          { emoji: "🌹", label: "Rose",          price: 99   },
  heart:         { emoji: "❤️",  label: "Heart",         price: 99   },
  clap:          { emoji: "👏", label: "Clap",          price: 99   },
  muscle:        { emoji: "💪", label: "Muscle",        price: 99   },
  wave:          { emoji: "🌊", label: "Wave",          price: 99   },
  confetti:      { emoji: "🎊", label: "Confetti",      price: 99   },
  snowflake:     { emoji: "❄️",  label: "Snowflake",     price: 99   },
  shooting_star: { emoji: "💫", label: "Shooting Star", price: 99   },
  // Tier 2 — $1.99
  fire:          { emoji: "🔥", label: "Fire",          price: 199  },
  star:          { emoji: "⭐",  label: "Star",          price: 199  },
  dumbbell:      { emoji: "🏋️", label: "Dumbbell",      price: 199  },
  medal:         { emoji: "🏅", label: "Medal",         price: 199  },
  lightning:     { emoji: "⚡", label: "Lightning",     price: 199  },
  party:         { emoji: "🎉", label: "Party",         price: 199  },
  football:      { emoji: "🏈", label: "Football",      price: 199  },
  basketball:    { emoji: "🏀", label: "Basketball",    price: 199  },
  // Tier 3 — $2.99–$4.99
  bouquet:       { emoji: "💐", label: "Bouquet",       price: 299  },
  rocket:        { emoji: "🚀", label: "Rocket",        price: 299  },
  target:        { emoji: "🎯", label: "Target",        price: 299  },
  fireworks:     { emoji: "🎆", label: "Fireworks",     price: 399  },
  crown:         { emoji: "👑", label: "Crown",         price: 499  },
  lion:          { emoji: "🦁", label: "Lion",          price: 499  },
  unicorn:       { emoji: "🦄", label: "Unicorn",       price: 499  },
  // Tier 4 — $9.99–$14.99
  diamond:       { emoji: "💎", label: "Diamond",       price: 999  },
  trophy:        { emoji: "🏆", label: "Trophy",        price: 1499 },
  // Ghost — premium
  fire_ghost:    { emoji: "👻", label: "Fire Ghost",    price: 1999 },
  champ_ghost:   { emoji: "👻", label: "Champ Ghost",   price: 3499 },
  golden_ghost:  { emoji: "👻", label: "Golden Ghost",  price: 4999 },
  diamond_ghost: { emoji: "👻", label: "Diamond Ghost", price: 9999 },
};

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe((process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim(), { httpClient: Stripe.createFetchHttpClient() });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { giftType, streamId, hostId, token } = body;

    const gift = GIFTS[giftType];
    if (!gift) return NextResponse.json({ error: "Invalid gift type" }, { status: 400 });
    if (!streamId || !hostId || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const fromUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
    if (!fromUid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    if (!await rateLimit(`gift:${fromUid}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (fromUid === hostId) return NextResponse.json({ error: "Cannot gift yourself" }, { status: 400 });

    // Parallel Firestore reads
    const [followers, creatorStripeId] = await Promise.all([
      getCreatorFollowersCount(hostId),
      getCreatorStripeId(hostId),
    ]);
    if (followers < MONETIZATION_FOLLOWER_THRESHOLD) return NextResponse.json({ error: "Creator not eligible for monetization" }, { status: 403 });
    if (!creatorStripeId) return NextResponse.json({ error: "Creator has not connected a payout account" }, { status: 402 });

    const platformFee = Math.round(gift.price * PLATFORM_FEE_PCT / 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${gift.emoji} ${gift.label} Gift`,
            description: "Sent live on Felcin",
            images: ["https://felcin.com/favicon.ico"],
          },
          unit_amount: gift.price,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `https://felcin.com/live/${streamId}?gift_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://felcin.com/live/${streamId}`,
      metadata: {
        giftType,
        giftEmoji: gift.emoji,
        streamId,
        fromUid,
        hostId,
        priceUsd: String(gift.price),
        creatorShareUsd: String(gift.price - platformFee),
      },
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: { destination: creatorStripeId },
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
