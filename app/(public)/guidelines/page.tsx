import type { Metadata } from "next";
import BackBar from "@/components/BackBar";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Felcin Community Guidelines — the rules that keep the Felcin fitness community safe, respectful, and positive for everyone.",
  alternates: { canonical: "https://www.felcin.com/guidelines" },
};

const SECTIONS = [
  { color: "#ef4444", title: "Zero Tolerance: Immediate Removal", intro: "The following content results in immediate removal and account ban, with no warning:", items: ["Child sexual abuse material (CSAM) or any sexual content involving minors", "Threats of physical violence against specific individuals or groups", "Content that facilitates terrorism or mass violence", "Doxxing (sharing private personal information to harm someone)", "Non-consensual intimate imagery (revenge porn)"] },
  { color: "#f59e0b", title: "Sexual & Adult Content", items: ["Nudity and sexually explicit content are not allowed", "Sexually suggestive content involving minors is strictly prohibited", "Content may not be sexualized without the subject's clear consent"] },
  { color: "#ef4444", title: "Harassment & Bullying", items: ["Do not target individuals with repeated unwanted contact or negative content", "Do not post content intended to shame, humiliate, or intimidate others", "Do not coordinate mass harassment campaigns against users", "Do not use slurs or derogatory language to attack individuals", "Criticism of public figures is allowed, but targeted harassment is not"] },
  { color: "#7C3AED", title: "Hate Speech & Discrimination", items: ["Content that promotes hatred based on race, ethnicity, religion, gender, sexual orientation, disability, or nationality is not allowed", "Do not dehumanize groups of people or call for discrimination", "Discussing these topics critically or educationally is permitted"] },
  { color: "#f97316", title: "Dangerous & Harmful Content", items: ["Do not post content that promotes eating disorders, self-harm, or suicide", "Do not promote the use of illegal drugs or dangerous substances", "Do not share instructions for making weapons or explosives", "Fitness content must not promote dangerous or medically irresponsible practices"] },
  { color: "#22c55e", title: "Privacy & Personal Information", items: ["Do not share someone else's private information without their consent", "Do not post images or videos of others taken without their knowledge in private settings", "Do not impersonate other users, public figures, or Felcin staff"] },
  { color: "#06b6d4", title: "Spam & Misinformation", items: ["Do not post repetitive, spammy, or irrelevant content", "Do not use bots or automated tools to like, follow, or post", "Do not share content you know to be false or deliberately misleading", "Do not create fake accounts or manipulate engagement"] },
  { color: "#818cf8", title: "Intellectual Property", items: ["Only post content you own or have rights to share", "Do not reproduce copyrighted content without permission"] },
];

export default function GuidelinesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#ccc", fontFamily: "system-ui, sans-serif" }}>
      <BackBar />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><rect width="64" height="64" rx="14" fill="#080808"/><path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white"/><circle cx="24" cy="29" r="4.5" fill="#080808"/><circle cx="40" cy="29" r="4.5" fill="#080808"/><path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f1f1", marginBottom: 6 }}>Community Guidelines</h1>
        <p style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Last updated: May 2025</p>
        <p style={{ marginBottom: 40 }}>Felcin is built around fitness, creativity, and community. These guidelines exist to keep the platform safe, positive, and welcoming for everyone. Violating these guidelines may result in content removal, account suspension, or a permanent ban.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 28, lineHeight: 1.75 }}>
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 4, height: 32, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f1f1" }}>{s.title}</h2>
              </div>
              {s.intro && <p style={{ marginBottom: 8 }}>{s.intro}</p>}
              <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                {s.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}

          <section style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 16, padding: "20px 24px" }}>
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
