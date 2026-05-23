"use client";

const BADGES = [
  {
    id: "creator", name: "Creator", price: "$4.99", period: "/mo",
    icon: "verified", grad: "#1c1c1c",
    glow: "rgba(255,255,255,0.04)",
    perks: ["Verified badge on all posts", "Priority in search results", "Creator support"],
  },
  {
    id: "pro", name: "Pro Creator", price: "$9.99", period: "/mo",
    icon: "workspace_premium", grad: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    glow: "rgba(124,58,237,0.25)",
    perks: ["Everything in Creator", "Advanced analytics", "Exclusive features", "Priority support"],
    popular: true,
  },
  {
    id: "star", name: "Star Creator", price: "$19.99", period: "/mo",
    icon: "star", grad: "linear-gradient(135deg,#d97706,#b45309)",
    glow: "rgba(217,119,6,0.25)",
    perks: ["Everything in Pro", "Featured placement", "Dedicated account manager", "Maximum visibility"],
  },
];

export default function BadgesPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Creator Badges</h1>
        <p className="text-sm mt-1" style={{ color: "#555" }}>Stand out and grow your audience</p>
      </div>

      <div className="flex flex-col gap-4">
        {BADGES.map((badge) => (
          <div key={badge.id} className="rounded-2xl overflow-hidden relative"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            {badge.popular && (
              <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>
                Most Popular
              </div>
            )}
            {/* Gradient header */}
            <div className="px-5 pt-5 pb-4" style={{ background: badge.grad, position: "relative", overflow: "hidden" }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.15)" }} />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>{badge.icon}</span>
                </div>
                <div>
                  <div className="font-bold text-white">{badge.name}</div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-2xl font-bold text-white">{badge.price}</span>
                    <span className="text-sm text-white opacity-70">{badge.period}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Perks */}
            <div className="px-5 py-4">
              <ul className="flex flex-col gap-2.5 mb-5">
                {badge.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2.5 text-sm" style={{ color: "#bbb" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#f2f2f2", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>check_circle</span>
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                className="w-full py-3 rounded-xl font-semibold text-sm text-white border-none cursor-pointer"
                style={{ background: badge.grad }}
                onClick={() => alert("Stripe integration coming soon.")}>
                Get {badge.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
