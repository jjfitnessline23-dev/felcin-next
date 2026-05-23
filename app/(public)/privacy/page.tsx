export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8" style={{ color: "#f1f1f1" }}>Privacy Policy</h1>
      <div className="flex flex-col gap-6" style={{ color: "#ccc", lineHeight: 1.7 }}>
        <section>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#f1f1f1" }}>1. Information We Collect</h2>
          <p>We collect information you provide when creating an account, including your email address and profile information. We also collect content you post on Felcin.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#f1f1f1" }}>2. How We Use Your Information</h2>
          <p>We use your information to provide and improve our services, communicate with you, and ensure platform safety.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#f1f1f1" }}>3. Data Storage</h2>
          <p>Your data is stored securely using Google Firebase infrastructure with industry-standard encryption.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#f1f1f1" }}>4. Your Rights</h2>
          <p>You can request deletion of your account and all associated data at any time by contacting us at support@felcin.com.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#f1f1f1" }}>5. Contact</h2>
          <p>For privacy questions, contact us at <a href="mailto:support@felcin.com" style={{ color: "#18e0b0" }}>support@felcin.com</a>.</p>
        </section>
      </div>
    </div>
  );
}
