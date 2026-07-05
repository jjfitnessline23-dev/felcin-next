"use client";
import BackBar from "@/components/BackBar";

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#f2f2f2", fontFamily: "'Inter', system-ui, sans-serif", overflowX: "hidden" }}>
      <BackBar />

      {/* Hero */}
      <div style={{ position: "relative", padding: "100px 24px 80px", textAlign: "center", overflow: "hidden" }}>
        {/* Glow */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 60%, rgba(124,58,237,0.22) 0%, transparent 65%)", pointerEvents: "none" }} />
        {/* Scan line */}
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)", pointerEvents: "none" }} />
        {/* Ghost watermark */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(420px, 80vw)", height: "min(420px, 80vw)", opacity: 0.04, pointerEvents: "none", zIndex: 0 }}>
          <img src="/static/logo-nav.svg" alt="" style={{ width: "100%", height: "100%", filter: "brightness(10)" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto" }}>
          <img src="/static/logo-nav.svg" alt="Felcin" style={{ width: 64, height: 64, borderRadius: 18, marginBottom: 28 }} />

          {/* Dictionary-style definition */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,58,237,0.25)", borderLeft: "3px solid #7C3AED", borderRadius: 16, padding: "32px 36px", textAlign: "left", marginBottom: 48 }}>
            <p style={{ fontSize: "clamp(1.4rem,4vw,2rem)", fontWeight: 800, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              Felcin{" "}
              <span style={{ fontSize: "clamp(0.75rem,2vw,0.9rem)", fontWeight: 500, color: "#666", letterSpacing: "0.05em", fontStyle: "italic" }}>(n.)</span>
            </p>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.15rem)", color: "#ccc", lineHeight: 1.75, margin: 0, fontWeight: 400 }}>
              An original coined term with no prior meaning, adopted as the exclusive brand identity of a next-generation fitness and social platform. Felcin represents the moment a person commits to their transformation — not alone, but alongside a community that trains, grows, and wins together.
            </p>
          </div>

          {/* Brand story */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 56 }}>
            {[
              { icon: "🔒", label: "Trademarked", sub: "Word mark filed · June 2026" },
              { icon: "⚡", label: "Coined from nothing", sub: "No prior meaning — 100% original" },
              { icon: "🤝", label: "Built for community", sub: "Train together, win together" },
            ].map((c) => (
              <div key={c.label} style={{ padding: "20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
                <p style={{ fontSize: 28, margin: "0 0 8px" }}>{c.icon}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f2", margin: "0 0 4px", letterSpacing: "0.04em" }}>{c.label}</p>
                <p style={{ fontSize: 12, color: "#555", margin: 0 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          <a href="/promo" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", borderRadius: 50, background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.4)", color: "#a78bfa", fontSize: 14, fontWeight: 700, textDecoration: "none", letterSpacing: "0.04em" }}>
            <span>▶</span> Watch the Story
          </a>
        </div>
      </div>

      {/* Footer line */}
      <div style={{ textAlign: "center", padding: "32px 24px 48px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p style={{ fontSize: 13, color: "#333", margin: 0, letterSpacing: "0.06em" }}>© 2026 Felcin LLC · Norwalk, CT · felcin.com</p>
      </div>
    </div>
  );
}
