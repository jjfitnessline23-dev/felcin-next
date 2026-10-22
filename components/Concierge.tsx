"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { auth, OWNER_UIDS } from "@/lib/firebase";

// Felcin ADMIN assistant — floating in-app assistant for the owner/admins only.
// Brand-green bubble bottom-right; talks to /api/concierge (server-side Claude, also
// admin-gated). Renders ONLY for OWNER_UIDS — regular members never see it.

type Msg = { role: "user" | "assistant"; content: string };

// Admins = owner UIDs OR John's admin emails (covers accounts whose uid isn't in OWNER_UIDS).
const ADMIN_EMAILS = ["johnjeannis@gmail.com", "jjfitnessline23@gmail.com"];

const GREETING =
  "Hi John — I'm your Felcin admin assistant. Ask me anything about how Felcin works, running the " +
  "platform, or an account/issue you're looking into, and I'll help you dig in.";

export default function Concierge() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  // Admins only — by owner UID or admin email. Regular members never see the bubble.
  const isAdmin =
    !!user && (OWNER_UIDS.includes(user.uid) || (!!user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())));
  if (!isAdmin) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token || ""}` },
        body: JSON.stringify({ messages: next, userEmail: user?.email || "" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "bad response");
      const suffix = data.escalated ? "\n\n✅ Passed to our team — they'll follow up." : "";
      setMsgs([...next, { role: "assistant", content: (data.reply || "") + suffix }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Sorry — I couldn't reach the assistant just now. Please try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Felcin Concierge" style={S.fab}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>💬</span>
        </button>
      )}

      {open && (
        <div style={S.panel}>
          <div style={S.header}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>✨</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Concierge</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={S.close}>×</button>
          </div>

          <div ref={bodyRef} style={S.body}>
            <Bubble role="assistant" text={GREETING} />
            {msgs.map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
            {busy && <Bubble role="assistant" text="…" muted />}
          </div>

          <div style={S.inputRow}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask the Concierge…"
              rows={1}
              style={S.input}
            />
            <button onClick={send} disabled={!input.trim() || busy} aria-label="Send"
              style={{ ...S.send, opacity: !input.trim() || busy ? 0.4 : 1 }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, text, muted }: { role: "user" | "assistant"; text: string; muted?: boolean }) {
  const mine = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "9px 12px",
          borderRadius: 14,
          fontSize: 14,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: mine ? "var(--fx-accent, #22c55e)" : "rgba(255,255,255,0.08)",
          color: mine ? "#04140a" : "#f2f2f2",
          borderBottomRightRadius: mine ? 4 : 14,
          borderBottomLeftRadius: mine ? 14 : 4,
          opacity: muted ? 0.6 : 1,
        }}
      >
        {text}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  fab: {
    position: "fixed", right: 20, bottom: 84, zIndex: 900,
    width: 54, height: 54, borderRadius: 27, border: "none", cursor: "pointer",
    background: "var(--fx-accent, #22c55e)", color: "#04140a",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  panel: {
    position: "fixed", right: 20, bottom: 20, zIndex: 900,
    width: "min(380px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 110px))",
    background: "#121212", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden",
    display: "flex", flexDirection: "column",
    boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px", background: "var(--fx-accent-dk, #16a34a)", color: "#fff",
  },
  close: { background: "transparent", border: "none", color: "#fff", fontSize: 24, lineHeight: 1, cursor: "pointer", padding: 0 },
  body: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#0d0d0d" },
  inputRow: { display: "flex", alignItems: "flex-end", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", background: "#121212" },
  input: {
    flex: 1, resize: "none", maxHeight: 120, borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)", background: "#1b1b1b", color: "#f2f2f2",
    padding: "9px 12px", fontSize: 14, fontFamily: "inherit", outline: "none",
  },
  send: {
    width: 38, height: 38, borderRadius: 19, border: "none", cursor: "pointer",
    background: "var(--fx-accent, #22c55e)", color: "#04140a", fontSize: 18, flexShrink: 0,
  },
};
