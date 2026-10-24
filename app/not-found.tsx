import Link from "next/link";

// Global 404 — must NOT be a dead end: give visitors the Felcin brand and clear
// links back into the site (Home, Explore, Pricing).
export default function NotFound() {
  return (
    <div style={{ background: "#090909", minHeight: "100dvh", color: "#f2f2f2", fontFamily: "var(--font-manrope, system-ui, sans-serif)", display: "flex", flexDirection: "column" }}>
      <nav style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-dk))", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>F</span></div>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Felcin</span>
        </Link>
      </nav>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" }}>
        <p style={{ fontSize: 64, fontWeight: 900, margin: 0, background: "linear-gradient(135deg,var(--fx-accent),var(--fx-accent-2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>404</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "8px 0 6px" }}>Page not found</h1>
        <p style={{ fontSize: 14, color: "#777", margin: "0 0 28px", maxWidth: 360, lineHeight: 1.6 }}>The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back on track.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/" style={{ padding: "12px 24px", borderRadius: 14, background: "var(--fx-accent)", color: "#000", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Home</Link>
          <Link href="/explore" style={{ padding: "12px 24px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#ddd", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Explore</Link>
          <Link href="/pricing" style={{ padding: "12px 24px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#ddd", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Pricing</Link>
        </div>
      </main>
    </div>
  );
}
