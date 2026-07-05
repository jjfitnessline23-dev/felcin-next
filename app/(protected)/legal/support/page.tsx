export default function SupportPage() {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px 64px", color: "#f2f2f2" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Felcin Support</h1>
      <p style={{ color: "#888", marginBottom: 32, fontSize: 15 }}>We're here to help. Reach out below and we'll get back to you within 24 hours.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 22px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Email Support</h2>
          <p style={{ color: "#888", fontSize: 14, marginBottom: 12 }}>For account issues, content reports, or general questions:</p>
          <a href="mailto:support@felcin.com" style={{ color: "#a78bfa", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>support@felcin.com</a>
        </div>

        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 16, padding: "20px 22px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Report Abusive Content</h2>
          <p style={{ color: "#888", fontSize: 14, marginBottom: 12 }}>Use the in-app Report button on any post or profile, or email us directly. We review all reports within 24 hours.</p>
          <a href="mailto:reports@felcin.com" style={{ color: "#f87171", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>reports@felcin.com</a>
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 22px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Response Time</h2>
          <p style={{ color: "#888", fontSize: 14 }}>We respond to all support requests within <strong style={{ color: "#f2f2f2" }}>24 hours</strong>. Content reports are actioned within 24 hours of submission.</p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 22px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Admin Email</h2>
          <a href="mailto:Admin@felcin.com" style={{ color: "#a78bfa", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>Admin@felcin.com</a>
        </div>
      </div>
    </div>
  );
}
