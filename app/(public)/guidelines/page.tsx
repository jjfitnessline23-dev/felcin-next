export default function GuidelinesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#ccc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
        <img src="/static/logo-nav.svg" alt="Felcin" width={40} height={40} style={{ marginBottom: 20 }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f1f1", marginBottom: 6 }}>Community Guidelines</h1>
        <p style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Last updated: May 2025</p>
        <p style={{ marginBottom: 40 }}>Felcin is built around fitness, creativity, and community. These guidelines exist to keep the platform safe, positive, and welcoming for everyone. Violating these guidelines may result in content removal, account suspension, or a permanent ban.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 32, lineHeight: 1.75 }}>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🚫</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Zero Tolerance: Immediate Removal</h2>
            </div>
            <p style={{ marginBottom: 8 }}>The following content results in immediate removal and account ban, with no warning:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Child sexual abuse material (CSAM) or any sexual content involving minors</li>
              <li>Threats of physical violence against specific individuals or groups</li>
              <li>Content that facilitates terrorism or mass violence</li>
              <li>Doxxing (sharing private personal information to harm someone)</li>
              <li>Non-consensual intimate imagery (revenge porn)</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Sexual & Adult Content</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Nudity and sexually explicit content are not allowed</li>
              <li>Sexually suggestive content involving minors is strictly prohibited</li>
              <li>Content may not be sexualized without the subject's clear consent</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🛑</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Harassment & Bullying</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Do not target individuals with repeated unwanted contact or negative content</li>
              <li>Do not post content intended to shame, humiliate, or intimidate others</li>
              <li>Do not coordinate mass harassment campaigns against users</li>
              <li>Do not use slurs or derogatory language to attack individuals</li>
              <li>Criticism of public figures is allowed, but targeted harassment is not</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🗣️</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Hate Speech & Discrimination</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Content that promotes hatred based on race, ethnicity, religion, gender, sexual orientation, disability, or nationality is not allowed</li>
              <li>Do not dehumanize groups of people or call for discrimination</li>
              <li>Discussing these topics critically or educationally is permitted</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Dangerous & Harmful Content</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Do not post content that promotes eating disorders, self-harm, or suicide</li>
              <li>Do not promote the use of illegal drugs or dangerous substances</li>
              <li>Do not share instructions for making weapons or explosives</li>
              <li>Fitness content must not promote dangerous or medically irresponsible practices</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Privacy & Personal Information</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Do not share someone else's private information without their consent</li>
              <li>Do not post images or videos of others taken without their knowledge in private settings</li>
              <li>Do not impersonate other users, public figures, or Felcin staff</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>📋</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Spam & Misinformation</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Do not post repetitive, spammy, or irrelevant content</li>
              <li>Do not use bots or automated tools to like, follow, or post</li>
              <li>Do not share content you know to be false or deliberately misleading</li>
              <li>Do not create fake accounts or manipulate engagement</li>
            </ul>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>📣</span>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1" }}>Intellectual Property</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Only post content you own or have rights to share</li>
              <li>Do not reproduce copyrighted content without permission</li>
              <li>If you believe your content was used without permission, email <a href="mailto:support@felcin.com" style={{ color: "#aaa" }}>support@felcin.com</a></li>
            </ul>
          </section>

          <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f1f1f1", marginBottom: 10 }}>Reporting Violations</h2>
            <p>See something that violates these guidelines? Use the <strong style={{ color: "#f1f1f1" }}>Report</strong> button on any post or profile, or email us at <a href="mailto:reports@felcin.com" style={{ color: "#f87171", fontWeight: 600 }}>reports@felcin.com</a>. We review all reports within 24 hours and take action immediately on severe violations.</p>
          </section>

        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 48, paddingTop: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <a href="/privacy" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Privacy Policy</a>
          <a href="/terms" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Terms of Service</a>
          <a href="/support" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Support</a>
          <span style={{ color: "#333", fontSize: 13 }}>© {new Date().getFullYear()} Felcin</span>
        </div>
      </div>
    </div>
  );
}
