"use client";

import { useState, useEffect } from "react";
import { sendEmailVerification, reload } from "firebase/auth";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/firebase";

export default function EmailVerifyBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("email-banner-dismissed") === "1"; } catch { return false; }
  });
  const [checking, setChecking] = useState(false);

  // Poll every 5 seconds while the banner is visible — as soon as Firebase
  // confirms emailVerified, reload the page so auth context picks it up fresh.
  useEffect(() => {
    if (!user || user.emailVerified || dismissed) return;
    if (!user.providerData?.some(p => p.providerId === "password")) return;

    const id = setInterval(async () => {
      try {
        if (!auth.currentUser) return;
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) {
          clearInterval(id);
          window.location.reload();
        }
      } catch {}
    }, 5000);

    return () => clearInterval(id);
  }, [user, dismissed]);

  if (!user || !user.email || user.emailVerified || dismissed) return null;
  if (!user.providerData.some(p => p.providerId === "password")) return null;

  const resend = async () => {
    try {
      await sendEmailVerification(auth.currentUser!);
      setSent(true);
    } catch {}
  };

  const checkNow = async () => {
    if (!auth.currentUser || checking) return;
    setChecking(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        window.location.reload();
      } else {
        setChecking(false);
      }
    } catch {
      setChecking(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: "env(safe-area-inset-top, 0px)",
      left: 0, right: 0,
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
        {sent ? "Check your inbox and click the link." : "Verify your email to secure your account."}
      </span>
      {sent ? (
        <button
          onClick={checkNow}
          disabled={checking}
          style={{ fontSize: 11, fontWeight: 700, color: "#facc15", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", flexShrink: 0, opacity: checking ? 0.5 : 1 }}>
          {checking ? "Checking…" : "Done ✓"}
        </button>
      ) : (
        <button
          onClick={resend}
          style={{ fontSize: 11, fontWeight: 700, color: "#facc15", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}>
          Resend
        </button>
      )}
      <button
        onClick={() => { try { localStorage.setItem("email-banner-dismissed", "1"); } catch {} setDismissed(true); }}
        style={{ fontSize: 11, color: "#78716c", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>
        ✕
      </button>
    </div>
  );
}
