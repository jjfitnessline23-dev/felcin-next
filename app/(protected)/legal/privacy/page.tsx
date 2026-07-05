export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 64px", color: "#ccc", lineHeight: 1.75 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f1f1", marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 36 }}>Last updated: May 2025 · Felcin, Inc.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>1. Information We Collect</h2>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li><strong style={{ color: "#f1f1f1" }}>Account information:</strong> Email address, display name, profile photo, and bio when you create an account.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Content you post:</strong> Photos, videos, captions, comments, and stories you share on Felcin.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Usage data:</strong> Pages visited, features used, time spent in the app, and interaction patterns.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Device information:</strong> Device type, operating system, browser type, and IP address.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Payment information:</strong> Processed securely by Stripe. We do not store card details.</li>
          </ul>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>2. How We Use Your Information</h2>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>To create and manage your account</li>
            <li>To display your content to other users</li>
            <li>To personalize your feed and recommendations</li>
            <li>To process badge subscriptions and payments</li>
            <li>To send service-related notifications and updates</li>
            <li>To detect and prevent fraud, abuse, and policy violations</li>
          </ul>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>3. Sharing of Information</h2>
          <p style={{ marginBottom: 8 }}>We do not sell your personal information. We may share with:</p>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li><strong style={{ color: "#f1f1f1" }}>Service providers:</strong> Google Firebase, Stripe — process data solely on our behalf.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Other users:</strong> Your profile and public content are visible to other users.</li>
            <li><strong style={{ color: "#f1f1f1" }}>Law enforcement:</strong> When required by law or to protect user safety.</li>
          </ul>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>4. Data Storage & Security</h2>
          <p>Your data is stored securely using Google Firebase with encryption at rest and in transit (TLS/SSL).</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>5. Data Retention</h2>
          <p>We retain your data while your account is active. Deletion requests are processed within 30 days.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>6. Children's Privacy</h2>
          <p>Felcin is not directed to children under 13. Accounts found to belong to users under 13 are removed immediately.</p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>7. Your Rights</h2>
          <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Access, correct, or delete your personal data</li>
            <li>Export your data in a structured format</li>
            <li>Object to certain processing of your data</li>
          </ul>
          <p style={{ marginTop: 8 }}>Contact: <a href="mailto:support@felcin.com" style={{ color: "#a78bfa" }}>support@felcin.com</a></p>
        </section>
        <section><h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>8. Changes to This Policy</h2>
          <p>We may update this policy and will notify you of significant changes via the app or email.</p>
        </section>
      </div>
    </div>
  );
}
