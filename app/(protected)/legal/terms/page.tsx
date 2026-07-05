export default function TermsPage() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 64px", color: "#ccc", lineHeight: 1.75 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f1f1", marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 36 }}>Last updated: May 2025 · Felcin, Inc.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>1. Acceptance of Terms</h2>
          <p>By creating an account or using Felcin, you agree to be bound by these Terms. We may update these terms at any time, and your continued use constitutes acceptance.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>2. Eligibility</h2>
          <p>You must be at least 13 years old to use Felcin. Users under 18 must have parental permission.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>3. Your Account</h2>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Provide accurate information when creating your account</li>
            <li>Keep your password secure and do not share it</li>
            <li>Be responsible for all activity under your account</li>
            <li>Notify us of unauthorized access at <a href="mailto:support@felcin.com" style={{ color: "#a78bfa" }}>support@felcin.com</a></li>
          </ul>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>4. Content & Conduct</h2>
          <p style={{ marginBottom: 8 }}>You retain ownership of content you post. By posting, you grant Felcin a license to display and distribute it on the platform. You agree not to post content that is illegal, harassing, hateful, or infringes intellectual property rights.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>5. Intellectual Property</h2>
          <p>Felcin's logos, design, and software are protected by copyright and trademark laws. You may not copy or reverse-engineer any part of the platform without written permission.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>6. Subscriptions & Payments</h2>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Creator badges are billed monthly and auto-renew</li>
            <li>Cancel at least 24 hours before renewal to avoid charges</li>
            <li>Refunds are not issued for partial billing periods</li>
            <li>Payments are processed securely by Stripe</li>
          </ul>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>7. Moderation & Enforcement</h2>
          <p>We reserve the right to remove content and suspend accounts that violate these terms. To report violations: <a href="mailto:reports@felcin.com" style={{ color: "#a78bfa" }}>reports@felcin.com</a></p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>8. Disclaimers & Limitation of Liability</h2>
          <p>Felcin is provided "as is." We are not responsible for user-generated content or any indirect, incidental, or consequential damages arising from your use of the platform.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>9. Contact</h2>
          <p><a href="mailto:support@felcin.com" style={{ color: "#a78bfa" }}>support@felcin.com</a></p>
        </section>
      </div>
    </div>
  );
}
