"use client";

// Shown to LOGGED-OUT visitors who open a gated feature (Ghost Workouts, Challenges,
// Badges, Premium) instead of silently bouncing them to /login. Explains the feature
// and offers a signup CTA + a "Log in" link. Rendered by app/(protected)/layout.tsx.

import Link from "next/link";

export interface FeatureUpsellProps {
  icon: string;
  color: string;
  label: string;
  title: string;
  body: string;
  points?: string[];
  showPricing?: boolean;
}

export default function FeatureUpsell({ icon, color, label, title, body, points, showPricing }: FeatureUpsellProps) {
  return (
    <div style={{ background: "#090909", minHeight: "100dvh", fontFamily: "var(--font-manrope, system-ui, sans-serif)", color: "#f2f2f2" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 50, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(9,9,9,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-dk))", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>F</span></div>
          <span style={{ color: "#f2f2f2", fontWeight: 800, fontSize: 17 }}>Felcin</span>
        </Link>
        <Link href="/explore" style={{ padding: "8px 14px", borderRadius: 20, color: "#bbb", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse the feed</Link>
      </nav>

      <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto 22px", background: `${color}1c`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color, margin: "0 0 10px" }}>{label.toUpperCase()}</p>
        <h1 style={{ fontSize: "clamp(28px,6vw,40px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.12, margin: "0 0 16px" }}>{title}</h1>
        <p style={{ fontSize: 16, color: "#888", lineHeight: 1.65, margin: "0 0 24px" }}>{body}</p>

        {points && points.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 auto 28px", maxWidth: 380, display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
            {points.map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontSize: 14.5, color: "#bbb", lineHeight: 1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color, flexShrink: 0 }}>check_circle</span>{p}
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 32px", borderRadius: 16, background: "var(--fx-accent)", color: "#000", fontSize: 16, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 24px rgba(var(--fx-accent-rgb),0.35)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>person_add</span>
            Create your free account
          </Link>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Link href="/login" style={{ color: "var(--fx-accent)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Log in</Link>
            {showPricing && <><span style={{ color: "#333" }}>·</span><Link href="/pricing" style={{ color: "#888", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>See pricing</Link></>}
          </div>
        </div>
      </main>
    </div>
  );
}
