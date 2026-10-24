import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Felcin",
  description: "Felcin is free to join. See Premium, profile badges, creator subscriptions, and exactly how creators get paid.",
};

// Prices below mirror the live Stripe checkout amounts defined server-side
// (subscribe/badge/premium checkout routes). Keep them in sync if those change.
const BADGES = [
  { label: "Bronze", price: "$1.99", emoji: "🥉" },
  { label: "Silver", price: "$4.99", emoji: "🥈" },
  { label: "Gold", price: "$9.99", emoji: "🥇" },
  { label: "Diamond", price: "$19.99", emoji: "💎" },
];

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ borderRadius: 20, background: "#0e0e0e", border: `1px solid ${accent ? "rgba(var(--fx-accent-rgb),0.3)" : "rgba(255,255,255,0.07)"}`, padding: "24px 22px" }}>
      {children}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div style={{ background: "#090909", minHeight: "100dvh", fontFamily: "var(--font-manrope, system-ui, sans-serif)", color: "#f2f2f2" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 50, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(9,9,9,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-dk))", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>F</span></div>
          <span style={{ color: "#f2f2f2", fontWeight: 800, fontSize: 17 }}>Felcin</span>
        </Link>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/explore" style={{ padding: "8px 14px", borderRadius: 20, color: "#bbb", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse</Link>
          <Link href="/login" style={{ padding: "8px 18px", borderRadius: 20, background: "var(--fx-accent)", color: "#000", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>Sign in</Link>
        </div>
      </nav>

      <header style={{ textAlign: "center", padding: "56px 20px 32px", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(32px,7vw,48px)", fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 14px" }}>Simple, honest pricing</h1>
        <p style={{ fontSize: 16, color: "#777", lineHeight: 1.6, margin: 0 }}>Felcin is free to use. Upgrade for Premium, grab a profile badge, or support the creators you follow.</p>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Free vs Premium */}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr" }} className="price-grid">
          <Card>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#888", letterSpacing: "0.08em", margin: "0 0 4px" }}>FREE</p>
            <p style={{ fontSize: 30, fontWeight: 900, margin: "0 0 12px" }}>$0<span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}> forever</span></p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Post, log workouts & track runs", "Follow athletes & join challenges", "Browse the feed, reels & profiles", "Tip and subscribe to creators"].map((t) => (
                <li key={t} style={{ fontSize: 14, color: "#bbb", display: "flex", gap: 8 }}><span style={{ color: "var(--fx-accent)" }}>✓</span>{t}</li>
              ))}
            </ul>
            <Link href="/login" style={{ display: "block", textAlign: "center", marginTop: 18, padding: "12px 0", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Create free account</Link>
          </Card>

          <Card accent>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.08em", margin: 0 }}>PREMIUM</p>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
            </div>
            <p style={{ fontSize: 30, fontWeight: 900, margin: "0 0 2px" }}>$9.99<span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}> / month</span></p>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>or $79.99 / year (save ~33%)</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Everything in Free", "Premium Ghost Workouts from top creators", "Premium features across the platform"].map((t) => (
                <li key={t} style={{ fontSize: 14, color: "#ddd", display: "flex", gap: 8 }}><span style={{ color: "#fbbf24" }}>✓</span>{t}</li>
              ))}
            </ul>
            <Link href="/login" style={{ display: "block", textAlign: "center", marginTop: 18, padding: "12px 0", borderRadius: 12, background: "var(--fx-accent)", color: "#000", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Get Premium</Link>
          </Card>
        </div>

        {/* Profile badges */}
        <Card>
          <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>Profile badges</p>
          <p style={{ fontSize: 13, color: "#777", margin: "0 0 16px", lineHeight: 1.5 }}>One-time badges that show on your profile. A fun way to stand out and support the platform.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }} className="badge-grid">
            {BADGES.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: 20 }}>{b.emoji}</span>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>{b.label}</div><div style={{ fontSize: 13, color: "var(--fx-accent)", fontWeight: 800 }}>{b.price}</div></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Support creators */}
        <Card>
          <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>Support a creator</p>
          <p style={{ fontSize: 13, color: "#777", margin: "0 0 14px", lineHeight: 1.5 }}>Back the athletes you follow with a monthly subscription, one-time tips, or gifts on live streams.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.05)" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Basic</span> <span style={{ fontSize: 13, color: "var(--fx-accent)", fontWeight: 800 }}>$3.99/mo</span></div>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.05)" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Pro</span> <span style={{ fontSize: 13, color: "var(--fx-accent)", fontWeight: 800 }}>$9.99/mo</span></div>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.05)" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Tips & gifts</span> <span style={{ fontSize: 13, color: "#888" }}>any amount</span></div>
          </div>
        </Card>

        {/* Creator payouts */}
        <Card>
          <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "var(--fx-accent)" }}>How creators get paid</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <li style={{ fontSize: 14, color: "#ccc", lineHeight: 1.5 }}><strong style={{ color: "#fff" }}>You keep 80%</strong> of tips, pay-per-view content, and paid training sessions.</li>
            <li style={{ fontSize: 14, color: "#ccc", lineHeight: 1.5 }}><strong style={{ color: "#fff" }}>You keep 70%</strong> of fan subscriptions and live-stream gifts.</li>
            <li style={{ fontSize: 14, color: "#ccc", lineHeight: 1.5 }}><strong style={{ color: "#fff" }}>Paid automatically</strong> to your connected Stripe account on every sale — no manual payout, no waiting on a threshold.</li>
            <li style={{ fontSize: 14, color: "#ccc", lineHeight: 1.5 }}><strong style={{ color: "#fff" }}>Creator Fund bonus:</strong> $0.40 per 1,000 views, paid monthly, for creators with 100K+ monthly views and 10K+ followers.</li>
          </ul>
          <p style={{ fontSize: 12, color: "#555", margin: "14px 0 0", lineHeight: 1.5 }}>Felcin&apos;s platform fee covers payment processing and keeping the lights on. Connect payouts in Settings once you&apos;ve created an account.</p>
        </Card>

        <div style={{ textAlign: "center", padding: "20px 0 0" }}>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 32px", borderRadius: 16, background: "var(--fx-accent)", color: "#000", fontSize: 16, fontWeight: 800, textDecoration: "none" }}>Create your free account</Link>
        </div>
      </main>

      <footer style={{ padding: "22px 20px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {[["/", "Home"], ["/explore", "Explore"], ["/pricing", "Pricing"], ["/about", "About"], ["/help", "Help"], ["/terms", "Terms"], ["/privacy", "Privacy"]].map(([h, l]) => (
            <Link key={h} href={h} style={{ color: "#555", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>{l}</Link>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#333", margin: 0 }}>© 2026 Felcin</p>
      </footer>

      <style>{`@media (min-width:640px){.price-grid{grid-template-columns:1fr 1fr}.badge-grid{grid-template-columns:repeat(4,1fr)}}`}</style>
    </div>
  );
}
