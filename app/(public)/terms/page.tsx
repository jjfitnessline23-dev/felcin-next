export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#ccc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
        <img src="/static/logo-nav.svg" alt="Felcin" width={40} height={40} style={{ marginBottom: 20 }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f1f1", marginBottom: 6 }}>Terms of Service</h1>
        <p style={{ color: "#555", fontSize: 13, marginBottom: 40 }}>Last updated: May 2025 · Felcin, Inc.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 32, lineHeight: 1.75 }}>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>1. Acceptance of Terms</h2>
            <p>By creating an account or using Felcin, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the platform. We may update these terms at any time, and your continued use constitutes acceptance of the revised terms.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>2. Eligibility</h2>
            <p>You must be at least 13 years old to use Felcin. By using the platform, you represent that you meet this requirement. If you are under 18, you must have permission from a parent or legal guardian. Users found to be under 13 will have their accounts removed immediately.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>3. Your Account</h2>
            <p style={{ marginBottom: 10 }}>You are responsible for maintaining the security of your account. You agree to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Provide accurate and current information when creating your account</li>
              <li>Keep your password secure and not share it with others</li>
              <li>Notify us immediately of any unauthorized access at <a href="mailto:support@felcin.com" style={{ color: "#aaa" }}>support@felcin.com</a></li>
              <li>Be responsible for all activity that occurs under your account</li>
              <li>Not create accounts using automated means or under false identities</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>4. Content & Conduct</h2>
            <p style={{ marginBottom: 10 }}>You retain ownership of content you post on Felcin. By posting content, you grant Felcin a non-exclusive, royalty-free, worldwide license to display, distribute, and promote your content on the platform.</p>
            <p style={{ marginBottom: 10 }}>You agree not to post content that:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Is illegal, obscene, or sexually explicit</li>
              <li>Harasses, bullies, or threatens other users</li>
              <li>Contains hate speech, discrimination, or incites violence</li>
              <li>Infringes copyright, trademark, or other intellectual property rights</li>
              <li>Contains spam, malware, or deceptive content</li>
              <li>Impersonates another person or entity</li>
              <li>Violates any applicable local, national, or international law</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>5. Intellectual Property</h2>
            <p>Felcin and its logos, design, software, and original content are owned by Felcin, Inc. and protected by copyright and trademark laws. You may not copy, modify, distribute, or reverse-engineer any part of the platform without our written permission.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>6. Badge Subscriptions & Payments</h2>
            <p style={{ marginBottom: 10 }}>Creator badges are billed monthly. By subscribing, you authorize recurring charges to your payment method. All payments are processed securely by Stripe.</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date</li>
              <li>Refunds are not issued for partial billing periods</li>
              <li>Prices are subject to change with 30 days' notice</li>
              <li>Badges and perks are for the account holder only and non-transferable</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>7. Moderation & Enforcement</h2>
            <p style={{ marginBottom: 10 }}>Felcin has zero tolerance for objectionable content and abusive behavior. We reserve the right to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Remove any content that violates these terms or our Community Guidelines</li>
              <li>Suspend or permanently ban accounts that violate our policies</li>
              <li>Report illegal activity to law enforcement authorities</li>
              <li>Take action without prior notice in cases of severe violations</li>
            </ul>
            <p style={{ marginTop: 10 }}>To report a violation, use the in-app Report button or email <a href="mailto:reports@felcin.com" style={{ color: "#aaa" }}>reports@felcin.com</a>. We review all reports within 24 hours.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>8. Privacy</h2>
            <p>Your use of Felcin is subject to our <a href="/privacy" style={{ color: "#aaa" }}>Privacy Policy</a>, which is incorporated into these Terms by reference. By using Felcin, you agree to the collection and use of your information as described therein.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>9. Disclaimers</h2>
            <p>Felcin is provided "as is" without warranties of any kind. We do not guarantee that the platform will be uninterrupted, error-free, or free of viruses. We are not responsible for content posted by users. User-generated content reflects the views of the individual users, not Felcin.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>10. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, Felcin shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the platform, including loss of data, revenue, or reputation.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>11. Termination</h2>
            <p>You may delete your account at any time through profile settings or by contacting support. We may terminate or suspend your account at any time for violation of these terms. Upon termination, your right to use the platform ceases immediately.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>12. Governing Law</h2>
            <p>These Terms are governed by the laws of the United States. Any disputes arising from these Terms shall be resolved through binding arbitration, except where prohibited by law.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>13. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:support@felcin.com" style={{ color: "#f1f1f1", fontWeight: 600 }}>support@felcin.com</a>.</p>
          </section>

        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 48, paddingTop: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <a href="/privacy" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Privacy Policy</a>
          <a href="/guidelines" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Community Guidelines</a>
          <a href="/support" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Support</a>
          <span style={{ color: "#333", fontSize: 13 }}>© {new Date().getFullYear()} Felcin</span>
        </div>
      </div>
    </div>
  );
}
