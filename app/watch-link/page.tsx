"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/firebase";

export default function WatchLinkPage() {
  const { user } = useAuth();
  const [code, setCode]       = useState("");
  const [status, setStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const claim = async () => {
    const trimmed = code.trim().replace(/\D/g, "");
    if (trimmed.length !== 6) { setMessage("Enter the 6-digit code shown on your Watch"); return; }
    if (!user) { setMessage("You must be signed in to link your Watch"); return; }

    setStatus("loading");
    setMessage("");

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/watch-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus("success");
      setMessage("Watch linked! Your records will appear on the Watch shortly.");
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message || "Something went wrong");
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⌚</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f2f2f2", margin: 0, marginBottom: 8 }}>Link Apple Watch</h1>
          <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: 0 }}>
            Open the Felcin app on your Watch, go to <strong style={{ color: "#aaa" }}>My Records</strong>, tap <strong style={{ color: "#aaa" }}>Get Code</strong>, then enter the 6-digit code below.
          </p>
        </div>

        {!user ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ color: "#555", fontSize: 14 }}>Sign in to Felcin first to link your Watch.</p>
          </div>
        ) : status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ color: "#22c55e", fontSize: 16, fontWeight: 700, margin: 0 }}>{message}</p>
          </div>
        ) : (
          <>
            <input
              type="number"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.slice(0, 6))}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "18px 16px", borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#131313", color: "#f2f2f2",
                fontSize: 28, fontWeight: 800, textAlign: "center",
                letterSpacing: 8, outline: "none",
                marginBottom: 14,
              }}
            />
            <button
              onClick={claim}
              disabled={status === "loading"}
              style={{
                width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
                background: status === "loading" ? "#1a1a1a" : "#3b82f6",
                color: status === "loading" ? "#555" : "#fff",
                fontSize: 16, fontWeight: 800, cursor: status === "loading" ? "not-allowed" : "pointer",
              }}
            >
              {status === "loading" ? "Linking…" : "Link Watch"}
            </button>
            {message && (
              <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: status === "error" ? "#ef4444" : "#555" }}>
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
