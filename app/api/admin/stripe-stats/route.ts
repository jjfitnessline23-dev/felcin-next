export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyToken } from "@/lib/firebaseAdmin";

const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];

function ts(daysAgo = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - daysAgo * 86400000) / 1000);
}

function sumRevenue(charges: Stripe.Charge[]): number {
  return charges.filter((c) => c.status === "succeeded").reduce((s, c) => s + c.amount, 0);
}

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid || !OWNER_UIDS.includes(uid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });

  const stripe = new Stripe(key.trim(), { httpClient: Stripe.createFetchHttpClient() });

  const [todayCharges, weekCharges, monthCharges, balance, recentCharges] = await Promise.all([
    stripe.charges.list({ limit: 100, created: { gte: ts(0) } }),
    stripe.charges.list({ limit: 100, created: { gte: ts(7) } }),
    stripe.charges.list({ limit: 100, created: { gte: ts(30) } }),
    stripe.balance.retrieve(),
    stripe.charges.list({ limit: 5 }),
  ]);

  const todaySucceeded = todayCharges.data.filter((c) => c.status === "succeeded");
  const weekSucceeded = weekCharges.data.filter((c) => c.status === "succeeded");
  const monthSucceeded = monthCharges.data.filter((c) => c.status === "succeeded");

  return NextResponse.json({
    today: { revenue: sumRevenue(todayCharges.data), count: todaySucceeded.length },
    week: { revenue: sumRevenue(weekCharges.data), count: weekSucceeded.length },
    month: { revenue: sumRevenue(monthCharges.data), count: monthSucceeded.length },
    balance: {
      available: balance.available.reduce((s, b) => s + b.amount, 0),
      pending: balance.pending.reduce((s, b) => s + b.amount, 0),
    },
    recent: recentCharges.data.slice(0, 5).map((c) => ({
      id: c.id,
      amount: c.amount,
      status: c.status,
      description: c.description,
      created: c.created,
    })),
  });
}
