"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import InAppPaymentModal from "@/components/InAppPaymentModal";

interface CreatorProfile { displayName?: string; photoURL?: string; followersCount?: number; bio?: string; }

const TIERS = [
  { id: "basic", label: "Basic Support", price: "$3.99", desc: "Support the creator and show your love", perks: ["Supporter badge on comments", "Exclusive posts access", "30-day access"] },
  { id: "pro",   label: "Pro Support",   price: "$9.99", desc: "Go all in and unlock everything",         perks: ["Pro supporter badge", "All exclusive posts", "Priority in comments", "30-day access"] },
];

export default function SubscribePage() {
  const params = useParams();
  const creatorUid = params.uid as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [subPayment, setSubPayment] = useState<{ clientSecret: string; tier: string; tierName: string; amount: number } | null>(null);
  const [currentSub, setCurrentSub] = useState<{ tier: string; expiresAt: { seconds: number } } | null>(null);
  const processedSubSessionRef = useRef<string | null>(null);

  useEffect(() => {
    getDoc(doc(db, "users", creatorUid, "public", "profile")).then((snap) => {
      if (snap.exists()) setProfile(snap.data() as CreatorProfile);
      else return getDoc(doc(db, "users", creatorUid)).then((r) => { if (r.exists()) setProfile(r.data() as CreatorProfile); });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [creatorUid]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "subscriptions", creatorUid)).then((snap) => {
      if (snap.exists()) setCurrentSub(snap.data() as { tier: string; expiresAt: { seconds: number } });
    }).catch(() => {});
  }, [user, creatorUid]);

  // Verify after Stripe redirect
  useEffect(() => {
    const sessionId = searchParams.get("sub_session_id");
    if (!sessionId || !user || processedSubSessionRef.current === sessionId) return;
    processedSubSessionRef.current = sessionId;
    router.replace(`/subscribe/${creatorUid}`);
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/subscribe-verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json()).then(async (data) => {
        if (!data.ok || !user) return;
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 86400000));
        await setDoc(doc(db, "users", user.uid, "subscriptions", data.creatorUid), {
          creatorUid: data.creatorUid, tier: data.tier, expiresAt, amountCents: data.amountCents,
          purchasedAt: Timestamp.now(),
        }, { merge: true }).catch(() => {});
        await addDoc(collection(db, "users", data.creatorUid, "earnings"), {
          type: "subscription", fromUid: user.uid, tier: data.tier,
          amountUsd: Math.round(data.amountCents * 0.7), timestamp: Timestamp.now(),
        }).catch(() => {});
        setSuccess(true);
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  async function subscribe(tierId: string) {
    if (!user || subscribing) return;
    setSubscribing(tierId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/subscribe-payment-intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId, creatorUid, creatorName: profile?.displayName || "Creator", token }),
      });
      const data = await res.json();
      if (data.clientSecret) setSubPayment({ clientSecret: data.clientSecret, tier: tierId, tierName: data.tierName, amount: data.amount });
    } catch {}
    setSubscribing(null);
  }

  const displayName = profile?.displayName || "Creator";
  const init = displayName.charAt(0).toUpperCase();

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;

  return (
    <div className="max-w-sm mx-auto px-4 py-8">
      <Link href={`/user-profile?uid=${creatorUid}`} className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span> Back
      </Link>

      {/* Creator header */}
      <div className="flex flex-col items-center mb-8">
        {profile?.photoURL
          ? <img src={profile.photoURL} alt="" className="rounded-full object-cover mb-3" style={{ width: 72, height: 72 }} />
          : <div className="rounded-full flex items-center justify-center font-bold mb-3" style={{ width: 72, height: 72, background: "#222", color: "#aaa", fontSize: 28 }}>{init}</div>}
        <h1 className="text-xl font-bold mb-1" style={{ color: "#f2f2f2" }}>Support {displayName}</h1>
        <p className="text-sm text-center" style={{ color: "#555", maxWidth: 260 }}>
          {profile?.bio || "Choose a tier to support this creator and unlock exclusive perks."}
        </p>
      </div>

      {success && (
        <div className="rounded-2xl p-4 mb-6 flex items-center gap-3"
          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#4ade80", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>Subscription activated! Enjoy your perks.</p>
        </div>
      )}

      {currentSub && !success && (
        <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#f2f2f2" }}>Active subscription</p>
          <p className="text-xs" style={{ color: "#555" }}>
            {currentSub.tier} · Expires {new Date(currentSub.expiresAt.seconds * 1000).toLocaleDateString()}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {TIERS.map((tier) => (
          <div key={tier.id} className="rounded-2xl p-5"
            style={{ background: "#131313", border: `1px solid ${tier.id === "pro" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}` }}>
            {tier.id === "pro" && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold mb-3"
                style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                ⭐ Most Popular
              </div>
            )}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold" style={{ color: "#f2f2f2" }}>{tier.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>{tier.desc}</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>{tier.price}</p>
            </div>
            <div className="flex flex-col gap-1.5 mb-4">
              {tier.perks.map((perk) => (
                <div key={perk} className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#555", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-sm" style={{ color: "#888" }}>{perk}</span>
                </div>
              ))}
            </div>
            <button onClick={() => subscribe(tier.id)} disabled={!!subscribing}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{
                background: subscribing === tier.id ? "rgba(255,255,255,0.08)" : tier.id === "pro" ? "#f2f2f2" : "rgba(255,255,255,0.1)",
                color: subscribing === tier.id ? "#444" : tier.id === "pro" ? "#000" : "#f2f2f2",
              }}>
              {subscribing === tier.id ? "Opening checkout…" : `Subscribe for ${tier.price}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-center mt-5" style={{ color: "#333" }}>70% goes directly to the creator · Secured by Stripe</p>

      {subPayment && (
        <InAppPaymentModal
          clientSecret={subPayment.clientSecret}
          title={subPayment.tierName}
          subtitle={`Supporting ${profile?.displayName || "Creator"} · Secured by Stripe`}
          buttonLabel={`Pay $${(subPayment.amount / 100).toFixed(2)}`}
          onClose={() => setSubPayment(null)}
          onSuccess={async (paymentIntentId) => {
            const activeTier = subPayment.tier;
            setSubPayment(null);
            if (!user) return;
            // Verify on server and write subscription to Firestore
            try {
              const expiresAt = new Date(Date.now() + 30 * 86400000);
              await setDoc(doc(db, "users", user.uid, "subscriptions", creatorUid), {
                creatorUid, tier: activeTier, expiresAt,
                amountCents: subPayment.amount, purchasedAt: new Date(), paymentIntentId,
              }, { merge: true });
              await addDoc(collection(db, "users", creatorUid, "earnings"), {
                type: "subscription", fromUid: user.uid, tier: activeTier,
                amountUsd: Math.round(subPayment.amount * 0.7), timestamp: new Date(),
              });
              setSuccess(true);
            } catch {}
          }}
        />
      )}
    </div>
  );
}
