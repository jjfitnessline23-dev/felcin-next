import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Felcin",
  description: "Felcin is the fitness social app where you log workouts, follow athletes, and train alongside creators in real time.",
};

export default function AboutPage() {
  return (
    <div style={{ background: "#090909", minHeight: "100dvh", fontFamily: "var(--font-manrope, system-ui, sans-serif)", color: "#f2f2f2" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 50, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(9,9,9,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-dk))", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>F</span></div>
          <span style={{ color: "#f2f2f2", fontWeight: 800, fontSize: 17 }}>Felcin</span>
        </Link>
        <Link href="/login" style={{ padding: "8px 18px", borderRadius: 20, background: "var(--fx-accent)", color: "#000", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>Sign in</Link>
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "56px 20px 64px" }}>
        <h1 style={{ fontSize: "clamp(30px,6vw,44px)", fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 18px" }}>Train with people who actually train.</h1>
        <p style={{ fontSize: 16, color: "#aaa", lineHeight: 1.7, margin: "0 0 20px" }}>
          Felcin is the fitness social app where you log workouts, follow athletes, and train alongside creators in real time — not just scroll past them.
        </p>
        <p style={{ fontSize: 15, color: "#888", lineHeight: 1.7, margin: "0 0 20px" }}>
          We built Felcin because working out alone is hard to stick with. Here you can track your runs and lifts, keep a streak going, join challenges, and follow creators whose training you actually want to do. Our Ghost Workouts let you train step-by-step alongside a creator&apos;s recorded session — same exercises, same pace, same timer.
        </p>
        <p style={{ fontSize: 15, color: "#888", lineHeight: 1.7, margin: "0 0 28px" }}>
          And it&apos;s a real platform for the people who make the content: creators earn from tips, subscriptions, premium workouts and the creator fund, all paid out automatically. If you build an audience here, you can earn from it.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" style={{ padding: "13px 26px", borderRadius: 14, background: "var(--fx-accent)", color: "#000", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>Create your free account</Link>
          <Link href="/explore" style={{ padding: "13px 26px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#ddd", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Browse the feed</Link>
        </div>
      </main>

      <footer style={{ padding: "22px 20px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {[["/", "Home"], ["/explore", "Explore"], ["/pricing", "Pricing"], ["/help", "Help"], ["/terms", "Terms"], ["/privacy", "Privacy"]].map(([h, l]) => (
            <Link key={h} href={h} style={{ color: "#555", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>{l}</Link>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#333", margin: 0 }}>© 2026 Felcin</p>
      </footer>
    </div>
  );
}
