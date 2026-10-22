"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Mobile invite prompt — the sidebar "Invite Friends" link is desktop-only, so surface the
// referral loop on phones too. Dismissible (persists), hidden on desktop (lg:hidden).
export default function InviteBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(localStorage.getItem("felcin_invite_dismissed") !== "1"); } catch { setShow(true); }
  }, []);
  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem("felcin_invite_dismissed", "1"); } catch {}
    setShow(false);
  }

  return (
    <div
      className="lg:hidden"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)",
        borderRadius: 14, padding: "11px 12px", marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 20 }}>🎁</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#f2f2f2" }}>Felcin's better with friends</div>
        <div style={{ fontSize: 12, color: "#a7b8b0" }}>Invite yours and grow the community.</div>
      </div>
      <Link
        href="/invite"
        style={{ flexShrink: 0, background: "var(--fx-accent, #22c55e)", color: "#04140a", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 999, textDecoration: "none" }}
      >
        Invite
      </Link>
      <button onClick={dismiss} aria-label="Dismiss" style={{ flexShrink: 0, background: "transparent", border: "none", color: "#6e817a", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: "0 2px" }}>×</button>
    </div>
  );
}
