"use client";

import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/firebase";

export default function EmailVerifyBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!user || !user.email || user.emailVerified || dismissed) return null;
  // Only show for email/password accounts, not OAuth
  if (!user.providerData.some((p) => p.providerId === "password")) return null;

  const resend = async () => {
    try {
      await sendEmailVerification(auth.currentUser!);
      setSent(true);
    } catch {}
  };

  return (
    <div style={{
      position: "fixed",
      top: "env(safe-area-inset-top, 0px)",
      left: 0,
      right: 0,
      zIndex: 9998,
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 14px",
      background: "rgba(234,179,8,0.12)",
      borderBottom: "1px solid rgba(234,179,8,0.25)",
      backdropFilter: "blur(12px)",
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#facc15", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>
        mark_email_unread
      </span>
      <span style={{ fontSize: 12, color: "#fde68a", flex: 1 }}>
        {sent ? "Verification email sent! Check your inbox." : "Please verify your email to secure your account."}
      </span>
      {!sent && (
        <button
          onClick={resend}
          style={{ fontSize: 11, fontWeight: 700, color: "#facc15", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}
        >
          Resend
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{ fontSize: 11, color: "#78716c", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
