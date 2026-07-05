"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import BadgePaymentModal from "@/components/BadgePaymentModal";

const BADGES = [
  {
    id: "verified",
    name: "Verified",
    price: "$1.99",
    period: "/mo",
    icon: "verified",
    grad: "linear-gradient(135deg,#1d4ed8,#1e40af)",
    glow: "rgba(29,78,216,0.3)",
    accent: "#60a5fa",
    perks: [
      "Blue verified checkmark on profile",
      "Confirmed identity badge",
      "Increased audience trust",
      "Eligible for creator programs",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    price: "$4.99",
    period: "/mo",
    icon: "draw",
    grad: "linear-gradient(135deg,#059669,#047857)",
    glow: "rgba(5,150,105,0.3)",
    accent: "#34d399",
    perks: [
      "Creator badge on profile & posts",
      "Priority in search results",
      "Access to creator analytics",
      "Creator support channel",
    ],
  },
  {
    id: "fitness_coach",
    name: "Fitness Coach",
    price: "$9.99",
    period: "/mo",
    icon: "fitness_center",
    grad: "linear-gradient(135deg,#0891b2,#0e7490)",
    glow: "rgba(8,145,178,0.3)",
    accent: "#22d3ee",
    perks: [
      "Fitness Coach badge on profile",
      "Verified trainer/coach status",
      "Featured in Fitness Coach directory",
      "Client booking link in bio",
      "Priority in fitness searches",
    ],
  },
  {
    id: "pro",
    name: "Pro Creator",
    price: "$12.99",
    period: "/mo",
    icon: "workspace_premium",
    grad: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    glow: "rgba(124,58,237,0.4)",
    accent: "#a78bfa",
    perks: [
      "Everything in Creator",
      "Advanced analytics dashboard",
      "Exclusive Pro features",
      "Profile highlighted in explore",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "athlete",
    name: "Athlete",
    price: "$14.99",
    period: "/mo",
    icon: "sports",
    grad: "linear-gradient(135deg,#dc2626,#b91c1c)",
    glow: "rgba(220,38,38,0.3)",
    accent: "#f87171",
    perks: [
      "Athlete badge on profile & posts",
      "Verified athlete/competitor status",
      "Featured in Athlete spotlight",
      "Sponsor-ready profile tools",
      "Performance analytics",
    ],
  },
  {
    id: "star",
    name: "Star Creator",
    price: "$19.99",
    period: "/mo",
    icon: "star",
    grad: "linear-gradient(135deg,#d97706,#b45309)",
    glow: "rgba(217,119,6,0.3)",
    accent: "#fbbf24",
    perks: [
      "Everything in Pro Creator",
      "Featured placement on home feed",
      "Dedicated account manager",
      "Early access to new features",
      "Maximum search visibility",
    ],
  },
  {
    id: "brand",
    name: "Brand",
    price: "$29.99",
    period: "/mo",
    icon: "business",
    grad: "linear-gradient(135deg,#475569,#334155)",
    glow: "rgba(71,85,105,0.3)",
    accent: "#94a3b8",
    perks: [
      "Brand-verified badge",
      "Business profile tools",
      "Multi-user account access",
      "Campaign & promotion tools",
      "Brand analytics suite",
      "Dedicated brand support",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: "$49.99",
    period: "/mo",
    icon: "diamond",
    grad: "linear-gradient(135deg,#be185d,#9d174d)",
    glow: "rgba(190,24,93,0.35)",
    accent: "#f472b6",
    perks: [
      "Everything in Star Creator",
      "Diamond Elite badge",
      "Top placement across all feeds",
      "White-glove account management",
      "Custom profile features",
      "Revenue sharing eligibility",
      "Invite-only creator events",
    ],
  },
];

export default function BadgesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [currentBadge, setCurrentBadge] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ clientSecret: string; badgeId: string; label: string; amount: number } | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    getDoc(doc(db, "config", "features")).then((snap) => {
      setEnabled(snap.exists() ? (snap.data().badgesEnabled ?? true) : true);
    }).catch(() => setEnabled(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setCurrentBadge(snap.data()?.badge ?? null);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    const sessionId = searchParams.get("badge_session_id");
    if (!sessionId) return;
    fetch(`/api/badge-purchase-verify?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setCurrentBadge(d.badgeId); showToast("Badge activated on your profile!"); } })
      .catch(() => {});
  }, [searchParams]);

  const purchaseBadge = async (badgeId: string) => {
    if (!user || buying) return;
    setBuying(badgeId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/badge-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeId, token }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setPaymentModal({ clientSecret: data.clientSecret, badgeId, label: data.badgeLabel, amount: data.amount });
      } else {
        showToast(data.error || "Something went wrong");
      }
    } catch {
      showToast("Something went wrong — please try again");
    }
    setBuying(null);
  };

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const activeBadge = BADGES.find((b) => b.id === currentBadge);

  if (enabled === null) {
    return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  }

  if (!enabled && !isOwner) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 38, color: "#333", fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
        </div>
        <h1 className="text-xl font-bold text-center mb-2" style={{ color: "#f2f2f2" }}>Badges Unavailable</h1>
        <p className="text-sm text-center" style={{ color: "#555" }}>Creator badges are temporarily disabled. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-10 overflow-x-hidden">
      <PageHeader title="Creator Badges" />

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap"
          style={{ background: "rgba(30,30,30,0.97)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0d0618 0%,#160924 50%,#0d0618 100%)", border: "1px solid rgba(167,139,250,0.22)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(124,58,237,0.2) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>verified</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>CREATOR BADGES</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 60%,#fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Stand Out. Get Verified.
          </h1>
          <p className="text-sm mb-3" style={{ color: "#555" }}>Choose a badge that matches your creator level</p>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-base font-black" style={{ color: "#a78bfa" }}>{BADGES.length}</span>
              <span className="text-xs ml-1.5" style={{ color: "#555" }}>badge types</span>
            </div>
            {activeBadge && (
              <>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>{activeBadge.icon}</span>
                  <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>{activeBadge.name} Active</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {BADGES.map((badge) => {
          const isActive = currentBadge === badge.id;
          return (
            <div key={badge.id} className="rounded-3xl overflow-hidden relative"
              style={{ background: "#0d0d0d", border: `1px solid ${isActive ? badge.accent + "50" : "rgba(255,255,255,0.07)"}`, boxShadow: isActive ? `0 0 30px ${badge.glow}` : "none" }}>

              {/* Popular badge */}
              {badge.popular && !isActive && (
                <div className="absolute top-4 right-4 z-10 px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.35)" }}>
                  Most Popular
                </div>
              )}
              {isActive && (
                <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  Active
                </div>
              )}

              {/* Header */}
              <div className="relative px-5 pt-5 pb-4 overflow-hidden" style={{ background: badge.grad }}>
                <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.2)" }} />
                <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1, bottom: 0, background: "rgba(255,255,255,0.1)" }} />
                {/* Glow orb */}
                <div className="absolute pointer-events-none" style={{ top: "-50%", right: "-10%", width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                <div className="relative flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>{badge.icon}</span>
                  </div>
                  <div>
                    <p className="font-black text-white text-base">{badge.name}</p>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-2xl font-black text-white">{badge.price}</span>
                      <span className="text-sm text-white opacity-60">{badge.period}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Perks */}
              <div className="px-5 py-4">
                <ul className="flex flex-col gap-2.5 mb-5">
                  {badge.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2.5 text-sm" style={{ color: "#bbb" }}>
                      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15, color: badge.accent, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      {perk}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isActive && purchaseBadge(badge.id)}
                  disabled={!!buying || isActive}
                  className="w-full py-3 rounded-2xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
                  style={{
                    background: isActive ? "rgba(34,197,94,0.1)" : buying === badge.id ? "rgba(255,255,255,0.05)" : badge.grad,
                    color: isActive ? "#22c55e" : buying === badge.id ? "#555" : "#fff",
                    border: isActive ? "1px solid rgba(34,197,94,0.25)" : "none",
                    boxShadow: isActive || buying === badge.id ? "none" : `0 0 20px ${badge.glow}`,
                    cursor: isActive ? "default" : "pointer",
                  }}>
                  {isActive ? (
                    <><span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check_circle</span> Currently Active</>
                  ) : buying === badge.id ? (
                    <><div className="spinner" style={{ width: 16, height: 16 }} /> Opening checkout…</>
                  ) : (
                    <><span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>{badge.icon}</span> Get {badge.name}</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {paymentModal && (
        <BadgePaymentModal
          clientSecret={paymentModal.clientSecret}
          badgeLabel={paymentModal.label}
          amountCents={paymentModal.amount}
          onClose={() => setPaymentModal(null)}
          onSuccess={(paymentIntentId) => {
            const activatedBadgeId = paymentModal.badgeId;
            setPaymentModal(null);
            fetch("/api/badge-intent-verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentIntentId }),
            })
              .then((r) => r.json())
              .then((d) => { if (d.ok) { setCurrentBadge(activatedBadgeId); showToast("Badge activated on your profile!"); } })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
