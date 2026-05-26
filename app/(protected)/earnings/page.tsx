"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, orderBy, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface EarningItem {
  id: string;
  type: string;
  giftEmoji?: string;
  giftType?: string;
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
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load creator's Stripe account status
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        const id = snap.data().stripeAccountId ?? null;
        setStripeAccountId(id);
        setStripeReady(!!id);
      }
    }).catch(() => {});
  }, [user]);

  // Load earnings history
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "earnings"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    getDocs(q).then((snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type ?? "gift",
          giftEmoji: data.giftEmoji ?? undefined,
          giftType: data.giftType ?? undefined,
          amountUsd: data.amountUsd ?? 0,
          ts: data.timestamp?.seconds ?? 0,
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
      const token = await user.getIdToken();
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

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: "rgba(30,30,30,0.95)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Earnings</h1>
        <p className="text-sm mt-1" style={{ color: "#555" }}>Your share of gifts from live streams</p>
      </div>

      {/* Total */}
      <div className="rounded-2xl p-5 mb-4"
        style={{ background: "linear-gradient(135deg,#0f1923,#0d1f2d)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "#555" }}>TOTAL EARNED</p>
        <p className="text-4xl font-bold mb-1" style={{ color: "#f2f2f2" }}>{dollars(totalUsd)}</p>
        <p className="text-xs" style={{ color: "#444" }}>70% of all gifts received during live streams</p>
      </div>

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
        </div>

        {!stripeReady && (
          <div className="rounded-xl p-3.5 mb-4"
            style={{ background: "rgba(99,91,255,0.06)", border: "1px solid rgba(99,91,255,0.15)" }}>
            <p className="text-sm font-medium mb-1" style={{ color: "#a5b4fc" }}>Connect your bank to get paid automatically</p>
            <p className="text-xs" style={{ color: "#555" }}>
              Takes 2 minutes. Stripe deposits your 70% cut directly to your bank account after each payout cycle.
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
              : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span> Connect Bank & Get Paid</>
          }
        </button>

        {stripeReady && stripeAccountId && (
          <p className="text-xs text-center mt-2" style={{ color: "#333" }}>
            Account: {stripeAccountId}
          </p>
        )}
      </div>

      {/* Gift history */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Gift History</p>
        </div>

        {loadingEarnings ? (
          <div className="flex justify-center py-10"><div className="spinner" /></div>
        ) : earnings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <span className="material-symbols-outlined mb-3" style={{ fontSize: 36, color: "#222" }}>card_giftcard</span>
            <p className="text-sm font-semibold mb-1" style={{ color: "#444" }}>No gifts yet</p>
            <p className="text-xs text-center" style={{ color: "#333" }}>
              Go live — viewers can send you gifts and your 70% shows up here instantly.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {earnings.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-4"
                style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ fontSize: 22 }}>{item.giftEmoji ?? "🎁"}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "#f2f2f2" }}>
                    {item.giftType ? item.giftType.charAt(0).toUpperCase() + item.giftType.slice(1) : "Gift"}
                  </p>
                  <p className="text-xs" style={{ color: "#555" }}>
                    {item.ts ? new Date(item.ts * 1000).toLocaleDateString() : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                  +{dollars(item.amountUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-center mt-4" style={{ color: "#2a2a2a" }}>
        Stripe automatically pays out your balance on a rolling 2-day schedule once your bank is connected.
      </p>
    </div>
  );
}
