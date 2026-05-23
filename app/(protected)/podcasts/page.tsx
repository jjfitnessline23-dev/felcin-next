"use client";

export default function PodcastsPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.1)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 44, color: "#fff", fontVariationSettings: "'FILL' 1" }}>podcasts</span>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
        style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.15)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
        COMING SOON
      </div>

      <h1 className="text-2xl font-bold text-center mb-3" style={{ color: "#f2f2f2" }}>Podcasts</h1>
      <p className="text-sm text-center leading-relaxed" style={{ color: "#555", maxWidth: 280 }}>
        Audio podcasts from your favorite creators are on the way. Stay tuned!
      </p>
    </div>
  );
}
