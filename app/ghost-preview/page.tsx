"use client";
import { useState } from "react";
import GhostGiftReveal, { type GhostVariant } from "@/components/GhostGiftReveal";

const GHOSTS: { variant: GhostVariant; label: string; price: string; bg: string; color: string }[] = [
  { variant: "fire",     label: "Fire Ghost",    price: "$19.99", bg: "linear-gradient(135deg,#f97316,#ef4444)", color: "#000" },
  { variant: "champion", label: "Champ Ghost",   price: "$34.99", bg: "linear-gradient(135deg,#22c55e,#4ade80)", color: "#000" },
  { variant: "gold",     label: "Golden Ghost",  price: "$49.99", bg: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#000" },
  { variant: "diamond",  label: "Diamond Ghost", price: "$99.99", bg: "linear-gradient(135deg,#3b82f6,#93c5fd)", color: "#000" },
];

export default function GhostPreview() {
  const [active, setActive] = useState<GhostVariant | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
      {active && <GhostGiftReveal variant={active} senderName="" onDone={() => setActive(null)} />}
      <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Ghost Gift Preview</h1>
      {GHOSTS.map(g => (
        <button key={g.variant} onClick={() => setActive(g.variant)}
          style={{ width: 280, padding: "14px 28px", borderRadius: 999, background: g.bg, color: g.color, fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer" }}>
          👻 {g.label} — {g.price}
        </button>
      ))}
    </div>
  );
}
