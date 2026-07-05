export default function GuidelinesPage() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 64px", color: "#ccc", lineHeight: 1.75 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f1f1", marginBottom: 4 }}>Community Guidelines</h1>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>Last updated: May 2025</p>
      <p style={{ marginBottom: 36 }}>Felcin is built around fitness, creativity, and community. These guidelines keep the platform safe and welcoming. Violations may result in content removal, account suspension, or a permanent ban.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {[
          { color: "#ef4444", title: "Zero Tolerance — Immediate Ban", items: ["Child sexual abuse material (CSAM)", "Threats of physical violence", "Content facilitating terrorism or mass violence", "Doxxing — sharing private info to harm someone", "Non-consensual intimate imagery"] },
          { color: "#f59e0b", title: "Sexual & Adult Content", items: ["Nudity and sexually explicit content are not allowed", "Sexually suggestive content involving minors is strictly prohibited"] },
          { color: "#ef4444", title: "Harassment & Bullying", items: ["No targeted repeated unwanted contact or negative content", "No content intended to shame, humiliate, or intimidate", "No mass harassment campaigns", "No slurs or derogatory attacks on individuals"] },
          { color: "#7C3AED", title: "Hate Speech & Discrimination", items: ["No content promoting hatred based on race, religion, gender, orientation, disability, or nationality", "No dehumanizing groups of people or calling for discrimination"] },
          { color: "#f97316", title: "Dangerous & Harmful Content", items: ["No promotion of eating disorders, self-harm, or suicide", "No promotion of illegal drugs or dangerous substances", "Fitness content must not promote medically irresponsible practices"] },
          { color: "#22c55e", title: "Privacy & Impersonation", items: ["No sharing someone's private information without consent", "No impersonating other users, public figures, or Felcin staff"] },
          { color: "#06b6d4", title: "Spam & Misinformation", items: ["No repetitive, spammy, or irrelevant content", "No bots or automated tools for engagement", "No deliberately false or misleading content"] },
        ].map((section) => (
          <section key={section.title}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 4, height: 32, borderRadius: 4, background: section.color, flexShrink: 0 }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1" }}>{section.title}</h2>
            </div>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 5 }}>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}

        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 14, padding: "18px 20px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 8 }}>Reporting Violations</h2>
          <p>Use the <strong style={{ color: "#f1f1f1" }}>Report</strong> button on any post or profile, or email <a href="mailto:reports@felcin.com" style={{ color: "#f87171", fontWeight: 600 }}>reports@felcin.com</a>. We review all reports within 24 hours.</p>
        </div>
      </div>
    </div>
  );
}
