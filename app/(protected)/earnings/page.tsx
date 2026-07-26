"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, orderBy, limit,
} from "@/lib/db";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

const FUND_MONTHLY_VIEW_THRESHOLD = 100_000;
const FUND_FOLLOWER_THRESHOLD = 10_000;

interface EarningItem {
  id: string;
  type: string;
  giftEmoji?: string;
  giftType?: string;
  tier?: string;
  month?: string;
  views?: number;
  amountUsd: number;
  ts: number;
}

export default function EarningsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [earningsFilter, setEarningsFilter] = useState<"all" | "tip" | "subscription" | "gift" | "fund">("all");
  const [earningsLimit, setEarningsLimit] = useState(30);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [monthlyViews, setMonthlyViews] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);

  // Check real Stripe account status
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/creator-stripe-onboard?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (data.connected && data.accountId) {
        setStripeAccountId(data.accountId);
        setStripeReady(data.payoutsEnabled === true);
        await setDoc(doc(db, "users", user.uid, "public", "profile"),
          { stripeAccountId: data.accountId }, { merge: true }).catch(() => {});
      }
    })().catch(() => {});
  }, [user]);

  // Load creator fund stats
  useEffect(() => {
    if (!user) return;
    const month = new Date().toISOString().slice(0, 7);
    Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDoc(doc(db, "users", user.uid, "monthlyViews", month)),
    ]).then(([userSnap, mvSnap]) => {
      if (userSnap.exists()) { const fc = userSnap.data().followersCount; setFollowersCount(typeof fc === "number" ? fc : 0); }
      if (mvSnap.exists()) { const mv = mvSnap.data().views; setMonthlyViews(typeof mv === "number" ? mv : 0); }
    }).catch(() => {});
  }, [user]);

  // Load earnings history
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "earnings"),
      orderBy("timestamp", "desc"),
      limit(500)
    );
    getDocs(q).then((snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type ?? "gift",
          giftEmoji: data.giftEmoji ?? undefined,
          giftType: data.giftType ?? undefined,
          tier: data.tier ?? undefined,
          month: data.month ?? undefined,
          views: typeof data.views === "number" ? data.views : undefined,
          amountUsd: typeof data.amountUsd === "number" ? data.amountUsd : 0,
          ts: typeof data.timestamp?.seconds === "number" ? data.timestamp.seconds : 0,
        };
      });
      setEarnings(items);
      setTotalUsd(items.reduce((s, i) => s + i.amountUsd, 0));
      setLoadingEarnings(false);
    }).catch(() => setLoadingEarnings(false));
  }, [user]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (!user) return;
    if (searchParams.get("stripe_success") === "1") showToast("✓ Stripe connected — you'll receive payouts automatically");
    if (searchParams.get("stripe_refresh") === "1") showToast("Session expired — please try connecting again");
  }, [searchParams, user]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleConnectStripe() {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("no token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/creator-stripe-onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, existingAccountId: stripeAccountId ?? undefined }),
      });
      const data = await res.json();
      if (data.url) {
        if (data.stripeAccountId && data.stripeAccountId !== stripeAccountId) {
          await setDoc(doc(db, "users", user.uid, "public", "profile"),
            { stripeAccountId: data.stripeAccountId }, { merge: true });
        }
        window.location.href = data.url;
      } else {
        showToast(data.error || "Could not connect Stripe — try again");
        setConnecting(false);
      }
    } catch {
      showToast("Something went wrong");
      setConnecting(false);
    }
  }

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const fundEligible = monthlyViews >= FUND_MONTHLY_VIEW_THRESHOLD && followersCount >= FUND_FOLLOWER_THRESHOLD;
  const viewPct = Math.min((monthlyViews / FUND_MONTHLY_VIEW_THRESHOLD) * 100, 100);
  const followerPct = Math.min((followersCount / FUND_FOLLOWER_THRESHOLD) * 100, 100);

  return (
    <div className="max-w-xl mx-auto pb-6">
      <PageHeader title="Earnings" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#00100a 0%,#001a0f 50%,#00100a 100%)", border: "1px solid rgba(16,185,129,0.2)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(16,185,129,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(16,185,129,0.2) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(100deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#10b981", fontVariationSettings: "'FILL' 1" }}>payments</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#10b981", letterSpacing: "0.18em" }}>EARNINGS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#6ee7b7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Creator Revenue</h1>
          <p className="text-sm" style={{ color: "#555" }}>70% of every tip, gift &amp; subscription</p>
          {!loadingEarnings && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-xl font-black" style={{ color: "#10b981" }}>{dollars(totalUsd)}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>total earned</span></div>
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#555" }}>{earnings.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>transactions</span></div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: "rgba(30,30,30,0.95)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}
      <div className="px-4 pt-4">

      {/* Total */}
      <div className="rounded-2xl p-5 mb-4"
        style={{ background: "linear-gradient(135deg,#0f1923,#0d1f2d)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "#555" }}>TOTAL EARNED</p>
        <p className="text-4xl font-bold mb-1" style={{ color: "#f2f2f2" }}>{dollars(totalUsd)}</p>
        <p className="text-xs" style={{ color: "#444" }}>70% of gifts, subscriptions, and view bonuses</p>
      </div>

      {/* Monetization Status — always visible */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: "#131313", border: `1px solid ${followersCount >= FUND_FOLLOWER_THRESHOLD ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.07)"}` }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: followersCount >= FUND_FOLLOWER_THRESHOLD ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${followersCount >= FUND_FOLLOWER_THRESHOLD ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: followersCount >= FUND_FOLLOWER_THRESHOLD ? "#a78bfa" : "#555", fontVariationSettings: "'FILL' 1" }}>
              {followersCount >= FUND_FOLLOWER_THRESHOLD ? "lock_open" : "lock"}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Creator Monetization</p>
            <p className="text-xs" style={{ color: "#555" }}>Tips · Subscriptions · PPV · Live Gifts</p>
          </div>
          {followersCount >= FUND_FOLLOWER_THRESHOLD ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#a78bfa" }} />
              <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Unlocked</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-xs font-semibold" style={{ color: "#555" }}>Locked</span>
            </div>
          )}
        </div>

        {followersCount >= FUND_FOLLOWER_THRESHOLD ? (
          <div className="rounded-xl p-3.5" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)" }}>
            <p className="text-sm font-medium mb-0.5" style={{ color: "#a78bfa" }}>All monetization features active</p>
            <p className="text-xs" style={{ color: "#555" }}>Fans can now tip, subscribe, and send live gifts</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs" style={{ color: "#555" }}>Followers</span>
              <span className="text-xs font-semibold" style={{ color: "#f2f2f2" }}>{followersCount.toLocaleString()} / 10,000</span>
            </div>
            <div className="rounded-full overflow-hidden mb-3" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((followersCount / 10_000) * 100, 100)}%`, background: "linear-gradient(90deg,#7C3AED,#a855f7)" }} />
            </div>
            <p className="text-xs" style={{ color: "#444" }}>
              {(10_000 - followersCount).toLocaleString()} more followers needed to unlock monetization
            </p>
          </div>
        )}
      </div>

      {/* Creator Fund — only visible once creator has 10K followers */}
      {followersCount >= FUND_FOLLOWER_THRESHOLD && <div className="rounded-2xl p-5 mb-4"
        style={{ background: "#131313", border: `1px solid ${fundEligible ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.07)"}` }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: fundEligible ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${fundEligible ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: fundEligible ? "#10b981" : "#555", fontVariationSettings: "'FILL' 1" }}>
              monetization_on
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Creator Fund</p>
            <p className="text-xs" style={{ color: "#555" }}>$0.40 per 1,000 views · paid monthly</p>
          </div>
          {fundEligible && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
              <span className="text-xs font-semibold" style={{ color: "#10b981" }}>Enrolled</span>
            </div>
          )}
        </div>

        {fundEligible ? (
          <div className="rounded-xl p-3.5"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
            <p className="text-sm font-medium mb-0.5" style={{ color: "#10b981" }}>Qualified this month</p>
            <p className="text-xs" style={{ color: "#555" }}>
              {(monthlyViews / 1000).toFixed(0)}K views this month · payout sent on the 1st
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Monthly views progress */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs" style={{ color: "#555" }}>Views this month</span>
                <span className="text-xs font-semibold" style={{ color: monthlyViews >= FUND_MONTHLY_VIEW_THRESHOLD ? "#10b981" : "#f2f2f2" }}>
                  {monthlyViews >= 1000 ? `${(monthlyViews / 1000).toFixed(0)}K` : monthlyViews.toLocaleString()} / 100K
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${viewPct}%`, background: monthlyViews >= FUND_MONTHLY_VIEW_THRESHOLD ? "#10b981" : "#635bff" }} />
              </div>
            </div>
            {/* Followers progress */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs" style={{ color: "#555" }}>Followers</span>
                <span className="text-xs font-semibold" style={{ color: followersCount >= FUND_FOLLOWER_THRESHOLD ? "#10b981" : "#f2f2f2" }}>
                  {followersCount.toLocaleString()} / 10K
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${followerPct}%`, background: followersCount >= FUND_FOLLOWER_THRESHOLD ? "#10b981" : "#635bff" }} />
              </div>
            </div>
            <p className="text-xs" style={{ color: "#444" }}>
              Get 100K views and 10K followers in a month to earn $0.40 per 1,000 views.
            </p>
          </div>
        )}
      </div>}

      {/* Stripe Connect payout */}
      <div className="rounded-2xl p-5 mb-4"
        style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,91,255,0.15)", border: "1px solid rgba(99,91,255,0.2)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#635bff", fontVariationSettings: "'FILL' 1" }}>
              account_balance_wallet
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Automatic Payouts</p>
            <p className="text-xs" style={{ color: "#555" }}>Stripe sends your earnings directly to your bank</p>
          </div>
          {stripeReady && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
              <span className="text-xs font-semibold" style={{ color: "#10b981" }}>Active</span>
            </div>
          )}
          {stripeAccountId && !stripeReady && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#fbbf24" }} />
              <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>Setup incomplete</span>
            </div>
          )}
        </div>

        {!stripeAccountId && (
          <div className="rounded-xl p-3.5 mb-4"
            style={{ background: "rgba(99,91,255,0.06)", border: "1px solid rgba(99,91,255,0.15)" }}>
            <p className="text-sm font-medium mb-1" style={{ color: "#a5b4fc" }}>Connect your bank to get paid automatically</p>
            <p className="text-xs" style={{ color: "#555" }}>
              Takes 2 minutes. Stripe deposits your 70% cut and view bonuses directly to your bank.
            </p>
          </div>
        )}

        {stripeAccountId && !stripeReady && (
          <div className="rounded-xl p-3.5 mb-4"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
            <p className="text-sm font-medium mb-1" style={{ color: "#fbbf24" }}>Finish setting up your payout account</p>
            <p className="text-xs" style={{ color: "#555" }}>
              Your Stripe account needs a few more details before payouts can go through.
            </p>
          </div>
        )}

        <button onClick={handleConnectStripe} disabled={connecting}
          className="w-full py-3 rounded-xl font-semibold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
          style={{
            background: connecting ? "rgba(255,255,255,0.06)" : "#635bff",
            color: connecting ? "#555" : "#fff",
            opacity: connecting ? 0.8 : 1,
            transition: "opacity 0.15s",
          }}>
          {connecting
            ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Connecting…</>
            : stripeReady
              ? <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span> Manage Payout Account</>
              : stripeAccountId
                ? <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span> Complete Stripe Setup</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span> Connect Bank & Get Paid</>
          }
        </button>

        {stripeReady && stripeAccountId && (
          <p className="text-xs text-center mt-2" style={{ color: "#333" }}>
            Account: {stripeAccountId}
          </p>
        )}
      </div>

      {/* Earnings history */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Earnings History</p>
          {earnings.length > 0 && (
            <select
              value={earningsFilter}
              onChange={(e) => { setEarningsFilter(e.target.value as typeof earningsFilter); setEarningsLimit(30); }}
              className="text-xs rounded-lg px-2 py-1 outline-none border-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.07)", color: "#888" }}>
              <option value="all">All</option>
              <option value="tip">Tips</option>
              <option value="subscription">Subscriptions</option>
              <option value="gift">Gifts</option>
              <option value="fund">View Bonuses</option>
            </select>
          )}
        </div>

        {loadingEarnings ? (
          <div className="flex justify-center py-10"><div className="spinner" /></div>
        ) : earnings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <span className="material-symbols-outlined mb-3" style={{ fontSize: 36, color: "#222" }}>payments</span>
            <p className="text-sm font-semibold mb-1" style={{ color: "#444" }}>No earnings yet</p>
            <p className="text-xs text-center" style={{ color: "#333" }}>
              Go live, get tips, or build your views — your 70% cut and view bonuses show up here.
            </p>
          </div>
        ) : (() => {
          const filtered = earningsFilter === "all" ? earnings : earnings.filter((e) => {
            if (earningsFilter === "fund") return e.type === "views";
            if (earningsFilter === "gift") return e.type === "gift" || e.type === "live_gift";
            return e.type === earningsFilter;
          });
          const visible = filtered.slice(0, earningsLimit);
          return (
            <div className="flex flex-col">
              {visible.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: "#444" }}>No {earningsFilter} earnings yet</p>
              ) : visible.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-4"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <span style={{ fontSize: 22 }}>
                    {item.type === "subscription" ? "⭐" : item.type === "tip" ? "💰" : item.type === "views" ? "👁️" : (item.giftEmoji ?? "🎁")}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: "#f2f2f2" }}>
                      {item.type === "subscription"
                        ? `${item.tier ? item.tier.charAt(0).toUpperCase() + item.tier.slice(1) : ""} Support`
                        : item.type === "tip"
                          ? "Tip received"
                          : item.type === "views"
                            ? `View Bonus — ${item.views ? (item.views / 1000).toFixed(0) + "K views" : ""}`
                            : item.giftType ? item.giftType.charAt(0).toUpperCase() + item.giftType.slice(1) : "Gift"}
                    </p>
                    <p className="text-xs" style={{ color: "#555" }}>
                      {item.type === "views" && item.month ? item.month : item.ts ? new Date(item.ts * 1000).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                    +{dollars(item.amountUsd)}
                  </span>
                </div>
              ))}
              {filtered.length > earningsLimit && (
                <button
                  onClick={() => setEarningsLimit((l) => l + 30)}
                  className="w-full py-3 text-xs font-semibold border-none cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.03)", color: "#555", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  Load more ({filtered.length - earningsLimit} remaining)
                </button>
              )}
            </div>
          );
        })()}
      </div>

      <p className="text-xs text-center mt-4" style={{ color: "#2a2a2a" }}>
        Gifts and subscriptions pay out via Stripe on a 2-day rolling schedule. View bonuses pay on the 1st of each month.
      </p>
      </div>
    </div>
  );
}
