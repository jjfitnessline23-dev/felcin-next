"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

const FEATURES = [
  { icon: "directions_run", title: "GPS Run Tracking", desc: "Track every run with live maps, pace, distance and route replay.", color: "#22c55e" },
  { icon: "group", title: "Fitness Social Feed", desc: "Share workouts, follow athletes and stay motivated together.", color: "#a78bfa" },
  { icon: "sprint", title: "Ghost Workouts", desc: "Train alongside pre-recorded workouts from top fitness creators.", color: "#f97316" },
  { icon: "emoji_events", title: "Challenges & PRs", desc: "Compete in community challenges and beat your personal records.", color: "#fbbf24" },
  { icon: "sports_martial_arts", title: "Certified Trainers", desc: "Book 1:1 sessions with verified trainers directly in the app.", color: "#06b6d4" },
  { icon: "favorite", title: "Health Tracking", desc: "Sync with Apple Watch for heart rate, calories and daily steps.", color: "#ef4444" },
];

const STATS = [
  { value: "GPS", label: "Live Route Tracking" },
  { value: "Free", label: "To Download" },
  { value: "iOS", label: "Apple Watch Sync" },
];

function UTMCapture() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const utm: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(k => {
      const v = searchParams.get(k);
      if (v) utm[k] = v;
    });
    if (Object.keys(utm).length > 0) {
      try { sessionStorage.setItem("felcin_utm", JSON.stringify(utm)); } catch {}
    }
  }, [searchParams]);
  return null;
}

export default function JoinPage() {
  return (
    <>
      <Suspense fallback={null}><UTMCapture /></Suspense>
    <div style={{ background: "#090909", minHeight: "100dvh", fontFamily: "var(--font-manrope, system-ui, sans-serif)" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(9,9,9,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>F</span>
          </div>
          <span style={{ color: "#f2f2f2", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>Felcin</span>
        </div>
        <Link href="/login" style={{ padding: "8px 18px", borderRadius: 20, background: "#22c55e", color: "#000", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 100, paddingBottom: 60, textAlign: "center", padding: "120px 20px 60px", background: "linear-gradient(180deg, rgba(34,197,94,0.08) 0%, transparent 60%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(34,197,94,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 580, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 50, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, letterSpacing: "0.04em" }}>FREE TO DOWNLOAD</span>
          </div>

          <h1 style={{ fontSize: "clamp(36px, 8vw, 56px)", fontWeight: 900, color: "#f2f2f2", lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
            The Fitness App<br />
            <span style={{ background: "linear-gradient(135deg, #22c55e, #4ade80)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Built for Real Athletes
            </span>
          </h1>

          <p style={{ fontSize: 17, color: "#666", lineHeight: 1.65, margin: "0 0 36px", maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
            Track runs with live GPS, share workouts, join challenges, and connect with your fitness community — all in one place.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "16px 32px", borderRadius: 16, background: "#22c55e", color: "#000", fontSize: 16, fontWeight: 800, textDecoration: "none", letterSpacing: "0.01em", boxShadow: "0 4px 24px rgba(34,197,94,0.35)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              Start Training Free
            </Link>
            <p style={{ fontSize: 12, color: "#333", margin: 0 }}>No credit card · Free forever · iOS & Web</p>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 48, flexWrap: "wrap" }}>
            {STATS.map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 24, fontWeight: 900, color: "#22c55e", margin: "0 0 2px", letterSpacing: "-0.5px" }}>{s.value}</p>
                <p style={{ fontSize: 11, color: "#444", fontWeight: 600, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: "20px 20px 60px", maxWidth: 640, margin: "0 auto" }}>
        <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.14em", marginBottom: 20 }}>EVERYTHING YOU NEED</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: "18px 16px", borderRadius: 18, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${f.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: f.color, fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#f2f2f2", margin: "0 0 5px", lineHeight: 1.3 }}>{f.title}</p>
              <p style={{ fontSize: 12, color: "#555", margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof */}
      <section style={{ padding: "0 20px 60px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ borderRadius: 24, background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(74,222,128,0.04))", border: "1px solid rgba(34,197,94,0.15)", padding: "32px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 28, fontWeight: 900, color: "#f2f2f2", margin: "0 0 8px", letterSpacing: "-0.5px" }}>Join the Community</p>
          <p style={{ fontSize: 14, color: "#555", margin: "0 0 28px", lineHeight: 1.6 }}>
            Runners, cyclists, gym-goers and athletes are already tracking their progress on Felcin. Come train with us.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link href="/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 0", borderRadius: 14, background: "#22c55e", color: "#000", fontSize: 15, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 20px rgba(34,197,94,0.3)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>person_add</span>
              Create Free Account
            </Link>
            <p style={{ fontSize: 12, color: "#333", margin: 0 }}>Already have an account? <Link href="/login" style={{ color: "#22c55e", textDecoration: "none", fontWeight: 700 }}>Sign in</Link></p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "20px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <p style={{ fontSize: 12, color: "#333", margin: 0 }}>© 2025 Felcin · <Link href="/privacy" style={{ color: "#444", textDecoration: "none" }}>Privacy</Link> · <Link href="/terms" style={{ color: "#444", textDecoration: "none" }}>Terms</Link></p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
    </>
  );
}
