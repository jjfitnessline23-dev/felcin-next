"use client";

// Public marketing homepage shown to LOGGED-OUT visitors at "/" (felcin.com has no
// separate marketing site, so the app's front door is this page). Signed-in users get
// the real feed instead — see app/(protected)/layout.tsx. Copy per the approved draft.

import Link from "next/link";

const STEPS = [
  { n: 1, text: "Pick a Ghost Workout from a creator you follow" },
  { n: 2, text: "Press start — the session guides you rep by rep" },
  { n: 3, text: "Log it automatically and keep your streak alive" },
];

const FEATURES = [
  { icon: "fitness_center", title: "Log & track", desc: "Sets, reps, weights and cardio, with a muscle map that shows what you actually trained.", color: "var(--fx-accent)" },
  { icon: "groups", title: "Train with creators", desc: "Ghost Workouts, live sessions and challenges from athletes and certified trainers.", color: "#a78bfa" },
  { icon: "payments", title: "Creators get paid", desc: "Tips, subscriptions and premium content. Build an audience here and earn from it.", color: "#fbbf24" },
];

export default function MarketingHome() {
  return (
    <div style={{ background: "#090909", minHeight: "100dvh", fontFamily: "var(--font-manrope, system-ui, sans-serif)" }}>
      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(9,9,9,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-dk))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>F</span>
          </div>
          <span style={{ color: "#f2f2f2", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>Felcin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/explore" style={{ padding: "8px 14px", borderRadius: 20, color: "#bbb", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse</Link>
          <Link href="/pricing" style={{ padding: "8px 14px", borderRadius: 20, color: "#bbb", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Pricing</Link>
          <Link href="/login" style={{ padding: "8px 18px", borderRadius: 20, background: "var(--fx-accent)", color: "#000", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "calc(env(safe-area-inset-top, 0px) + 88px) 20px 44px", textAlign: "center", background: "linear-gradient(180deg, rgba(var(--fx-accent-rgb),0.08) 0%, transparent 60%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(var(--fx-accent-rgb),0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 50, background: "rgba(var(--fx-accent-rgb),0.1)", border: "1px solid rgba(var(--fx-accent-rgb),0.25)", marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--fx-accent)", display: "inline-block", animation: "fx-pulse 2s infinite" }} />
            <span style={{ fontSize: 12, color: "var(--fx-accent)", fontWeight: 700, letterSpacing: "0.04em" }}>FREE TO JOIN</span>
          </div>
          <h1 style={{ fontSize: "clamp(34px, 7vw, 54px)", fontWeight: 900, color: "#f2f2f2", lineHeight: 1.08, letterSpacing: "-0.03em", margin: "0 0 18px" }}>
            Train with people<br />
            <span style={{ background: "linear-gradient(135deg, var(--fx-accent), var(--fx-accent-2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>who actually train.</span>
          </h1>
          <p style={{ fontSize: 17, color: "#777", lineHeight: 1.6, margin: "0 0 34px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Felcin is the fitness social app where you log workouts, follow athletes, and train alongside creators in real time — not just scroll past them.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "16px 32px", borderRadius: 16, background: "var(--fx-accent)", color: "#000", fontSize: 16, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 24px rgba(var(--fx-accent-rgb),0.35)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>person_add</span>
              Create your free account
            </Link>
            <Link href="/explore" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ddd", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>explore</span>
              Browse the feed
            </Link>
            <a href="#ghost" style={{ marginTop: 6, color: "#666", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>See how Ghost Workouts work ↓</a>
          </div>
        </div>
      </section>

      {/* Ghost Workout explainer */}
      <section id="ghost" style={{ padding: "40px 20px 56px", maxWidth: 640, margin: "0 auto", scrollMarginTop: 80 }}>
        <div style={{ borderRadius: 24, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)", padding: "32px 24px" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "0.14em", marginBottom: 10 }}>GHOST WORKOUTS</p>
          <h2 style={{ fontSize: "clamp(24px,5vw,32px)", fontWeight: 900, color: "#f2f2f2", textAlign: "center", lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>Don&apos;t just watch a workout.<br />Do it with them.</h2>
          <p style={{ fontSize: 15, color: "#777", textAlign: "center", lineHeight: 1.6, margin: "0 0 28px", maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
            Pick a creator&apos;s pre-recorded session and train alongside it in real time — same exercises, same pace, same timer. No guessing what to do next, no training alone.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14, background: "#141414", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f97316", fontWeight: 900, fontSize: 14 }}>{s.n}</div>
                <span style={{ fontSize: 14, color: "#ddd", fontWeight: 600 }}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — exactly three */}
      <section style={{ padding: "0 20px 56px", maxWidth: 760, margin: "0 auto" }}>
        <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.14em", marginBottom: 20 }}>WHY FELCIN</p>
        <div className="mkt-features" style={{ display: "grid", gap: 14 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ padding: "22px 18px", borderRadius: 18, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: `${f.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: f.color, fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#f2f2f2", margin: "0 0 6px" }}>{f.title}</p>
              <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For creators */}
      <section style={{ padding: "0 20px 56px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ borderRadius: 24, background: "linear-gradient(135deg, rgba(167,139,250,0.1), rgba(var(--fx-accent2-rgb),0.04))", border: "1px solid rgba(167,139,250,0.2)", padding: "32px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.14em", marginBottom: 10 }}>FOR TRAINERS &amp; CREATORS</p>
          <h2 style={{ fontSize: "clamp(22px,4.5vw,28px)", fontWeight: 900, color: "#f2f2f2", margin: "0 0 12px", lineHeight: 1.2 }}>Your audience already trains.<br />Now they can train with you.</h2>
          <p style={{ fontSize: 14, color: "#777", margin: "0 0 24px", lineHeight: 1.6 }}>
            Publish workouts, go live, run challenges and sell premium content — all in one place, without sending your followers to five different apps.
          </p>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 14, background: "#a78bfa", color: "#1a0b2e", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>star</span>
            Become a creator
          </Link>
        </div>
      </section>

      {/* Pricing teaser */}
      <section style={{ padding: "0 20px 56px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }} className="mkt-pricing">
          <div style={{ padding: "20px 18px", borderRadius: 18, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--fx-accent)", margin: "0 0 6px" }}>Free</p>
            <p style={{ fontSize: 13, color: "#777", margin: 0, lineHeight: 1.55 }}>Post, log, follow and join challenges — always free.</p>
          </div>
          <div style={{ padding: "20px 18px", borderRadius: 18, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", margin: "0 0 6px" }}>Creator badges</p>
            <p style={{ fontSize: 13, color: "#777", margin: 0, lineHeight: 1.55 }}>One-time profile badges from $1.99, plus creator subscriptions and Premium.</p>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/pricing" style={{ color: "var(--fx-accent)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>See full pricing →</Link>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "0 20px 64px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(24px,5vw,34px)", fontWeight: 900, color: "#f2f2f2", letterSpacing: "-0.02em", margin: "0 0 20px", lineHeight: 1.15 }}>
          Your next workout<br />doesn&apos;t have to be alone.
        </h2>
        <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "16px 32px", borderRadius: 16, background: "var(--fx-accent)", color: "#000", fontSize: 16, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 24px rgba(var(--fx-accent-rgb),0.35)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
          Create your free account
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ padding: "22px 20px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { href: "/about", label: "About" },
            { href: "/pricing", label: "Pricing" },
            { href: "/help", label: "Help" },
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/guidelines", label: "Community Guidelines" },
          ].map((l) => (
            <Link key={l.href} href={l.href} style={{ color: "#555", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>{l.label}</Link>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#333", margin: 0 }}>© 2026 Felcin</p>
      </footer>

      <style>{`
        @keyframes fx-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @media (min-width: 720px) { .mkt-features { grid-template-columns: repeat(3,1fr); } }
      `}</style>
    </div>
  );
}
