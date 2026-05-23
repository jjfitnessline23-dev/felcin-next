"use client";

const BADGES = [
  {
    id: "verified",
    name: "Verified",
    price: "$1.99",
    period: "/mo",
    icon: "verified",
    grad: "linear-gradient(135deg,#1d4ed8,#1e40af)",
    glow: "rgba(29,78,216,0.25)",
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
    glow: "rgba(5,150,105,0.25)",
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
    glow: "rgba(8,145,178,0.25)",
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
    glow: "rgba(124,58,237,0.25)",
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
    glow: "rgba(220,38,38,0.25)",
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
    glow: "rgba(217,119,6,0.25)",
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
    glow: "rgba(190,24,93,0.3)",
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
                onClick={() => alert("Badge subscriptions coming soon.")}>
                Get {badge.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
