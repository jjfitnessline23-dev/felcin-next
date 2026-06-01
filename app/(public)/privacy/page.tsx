export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#ccc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><rect width="64" height="64" rx="14" fill="#080808"/><path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white"/><circle cx="24" cy="29" r="4.5" fill="#080808"/><circle cx="40" cy="29" r="4.5" fill="#080808"/><path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f1f1", marginBottom: 6 }}>Privacy Policy</h1>
        <p style={{ color: "#555", fontSize: 13, marginBottom: 40 }}>Last updated: May 2025 Â· Felcin, Inc.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 32, lineHeight: 1.75 }}>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>1. Information We Collect</h2>
            <p style={{ marginBottom: 10 }}>We collect information in the following ways:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong style={{ color: "#f1f1f1" }}>Account information:</strong> Email address, display name, profile photo, and bio when you create an account.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Content you post:</strong> Photos, videos, captions, comments, and stories you share on Felcin.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Usage data:</strong> Pages visited, features used, time spent in the app, and interaction patterns.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Device information:</strong> Device type, operating system, browser type, and IP address.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Communication:</strong> Messages you send to our support team and reports you submit.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Payment information:</strong> If you purchase a badge, payment is processed securely by Stripe. We do not store card details.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>2. How We Use Your Information</h2>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>To create and manage your account</li>
              <li>To display your content to other users</li>
              <li>To personalize your feed and recommendations</li>
              <li>To process badge subscriptions and payments</li>
              <li>To send service-related notifications and updates</li>
              <li>To detect, investigate, and prevent fraud, abuse, and policy violations</li>
              <li>To improve and develop new features</li>
              <li>To respond to support requests</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>3. Sharing of Information</h2>
            <p style={{ marginBottom: 10 }}>We do not sell your personal information. We may share information with:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong style={{ color: "#f1f1f1" }}>Service providers:</strong> Google Firebase (hosting, database, authentication, storage), Stripe (payments). These providers process data solely on our behalf.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Other users:</strong> Your profile, posts, and public content are visible to other users on the platform.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Law enforcement:</strong> When required by law, court order, or to protect the safety of users or the public.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, your data may be transferred.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>4. Data Storage & Security</h2>
            <p>Your data is stored securely using Google Firebase infrastructure, which employs industry-standard encryption at rest and in transit (TLS/SSL). Media files are stored in Firebase Storage with access controls. We implement technical and organizational measures to protect your information against unauthorized access, alteration, disclosure, or destruction.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>5. Data Retention</h2>
            <p>We retain your account information and content for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law or for legitimate business purposes (such as resolving disputes).</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>6. Cookies & Tracking</h2>
            <p>We use cookies and similar technologies to keep you logged in, remember your preferences, and analyze how the platform is used. Authentication tokens are stored in your browser to maintain your session. We do not use third-party advertising cookies.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>7. Children's Privacy</h2>
            <p>Felcin is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has created an account, we will delete their information immediately. If you believe a child under 13 has registered, please contact us at <a href="mailto:support@felcin.com" style={{ color: "#aaa" }}>support@felcin.com</a>.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>8. Your Rights</h2>
            <p style={{ marginBottom: 10 }}>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong style={{ color: "#f1f1f1" }}>Access:</strong> Request a copy of the data we hold about you.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Correction:</strong> Update inaccurate or incomplete information via your profile settings.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Deletion:</strong> Request deletion of your account and all associated data.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Portability:</strong> Request an export of your data in a structured format.</li>
              <li><strong style={{ color: "#f1f1f1" }}>Objection:</strong> Object to certain processing of your data.</li>
            </ul>
            <p style={{ marginTop: 10 }}>To exercise any of these rights, contact us at <a href="mailto:support@felcin.com" style={{ color: "#aaa" }}>support@felcin.com</a>.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>9. International Data Transfers</h2>
            <p>Felcin operates globally. Your information may be transferred to and stored on servers in the United States or other countries. By using Felcin, you consent to the transfer of your information to countries outside your country of residence, which may have different data protection rules.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. When we make significant changes, we will notify you via the app or email. Your continued use of Felcin after any changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>11. Contact Us</h2>
            <p>For privacy-related questions or requests, contact us at:</p>
            <p style={{ marginTop: 8 }}>
              <a href="mailto:support@felcin.com" style={{ color: "#f1f1f1", fontWeight: 600 }}>support@felcin.com</a>
            </p>
          </section>

        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 48, paddingTop: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <a href="/terms" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Terms of Service</a>
          <a href="/support" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Support</a>
          <a href="/guidelines" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Community Guidelines</a>
          <span style={{ color: "#333", fontSize: 13 }}>Â© {new Date().getFullYear()} Felcin</span>
        </div>
      </div>
    </div>
  );
}

