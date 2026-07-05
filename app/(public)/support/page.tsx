import BackBar from "@/components/BackBar";

export default function SupportPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#f2f2f2", fontFamily: "system-ui, sans-serif" }}>
      <BackBar />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="48" height="48"><rect width="64" height="64" rx="14" fill="#080808"/><path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white"/><circle cx="24" cy="29" r="4.5" fill="#080808"/><circle cx="40" cy="29" r="4.5" fill="#080808"/><path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Felcin Support</h1>
        <p style={{ color: "#888", marginBottom: 40, fontSize: 15 }}>
          We're here to help. Reach out using any of the options below and we'll get back to you within 24 hours.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Email Support</h2>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 10 }}>
              For account issues, content reports, or general questions:
            </p>
            <a href="mailto:support@felcin.com"
              style={{ color: "#fff", fontWeight: 600, fontSize: 15, textDecoration: "none", background: "#222", padding: "10px 18px", borderRadius: 10, display: "inline-block", border: "1px solid #333" }}>
              support@felcin.com
            </a>
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Report Abusive Content</h2>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 10 }}>
              To report objectionable content or abusive users, use the in-app Report button on any post or profile,
              or email us directly. We review all reports within 24 hours and remove violating content immediately.
            </p>
            <a href="mailto:reports@felcin.com"
              style={{ color: "#f87171", fontWeight: 600, fontSize: 15, textDecoration: "none", background: "rgba(239,68,68,0.1)", padding: "10px 18px", borderRadius: 10, display: "inline-block", border: "1px solid rgba(239,68,68,0.2)" }}>
              reports@felcin.com
            </a>
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Community Guidelines</h2>
            <p style={{ color: "#888", fontSize: 14 }}>
              Felcin has zero tolerance for objectionable content, harassment, hate speech, or abusive behavior.
              Violations result in immediate content removal and account suspension.
              All user-generated content is subject to moderation.
            </p>
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Response Time</h2>
            <p style={{ color: "#888", fontSize: 14 }}>
              We respond to all support requests within <strong style={{ color: "#f2f2f2" }}>24 hours</strong>.
              Content reports are reviewed and acted upon within 24 hours of submission.
            </p>
          </div>
        </div>

        <p style={{ color: "#555", fontSize: 13, marginTop: 40 }}>
          Â© {new Date().getFullYear()} Felcin. All rights reserved. Â·{" "}
          <a href="/privacy" style={{ color: "#666", textDecoration: "none" }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

