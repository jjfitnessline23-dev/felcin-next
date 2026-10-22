"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { collection, query, where, getDocs, setDoc, doc } from "@/lib/db";
import { db } from "@/lib/firebase";

// Referral reward tiers — recognition that grows as you bring friends in.
const TIERS = [
  { n: 1, emoji: "🌱", label: "First invite" },
  { n: 3, emoji: "🔥", label: "On a roll" },
  { n: 5, emoji: "🏆", label: "Community Builder" },
  { n: 10, emoji: "⭐", label: "Felcin Ambassador" },
];

// Invite / referral loop — turns members into an acquisition channel.
// Each member shares felcin.com/login?ref=<their uid>; new signups that arrive with that
// ref get `referredBy` stamped on their doc (see lib/auth). This page shows the link,
// a share/copy action, and how many friends have joined.
export default function InvitePage() {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.felcin.com";
  const link = user ? `${origin}/login?ref=${user.uid}` : "";

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "users"), where("referredBy", "==", user.uid)));
        const c = snap.docs.length;
        setCount(c);
        // Grant the Community Builder status at 5 invites — own-doc write, so no rules issue.
        if (c >= 5) { try { await setDoc(doc(db, "users", user.uid), { communityBuilder: true }, { merge: true }); } catch {} }
      } catch {
        setCount(null);
      }
    })();
  }, [user]);

  async function share() {
    const text = "Join me on Felcin — the fitness community where your workouts actually count. 💪";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on Felcin", text, url: link });
        return;
      }
    } catch { /* fall through to copy */ }
    copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 18px 80px", color: "#f2f2f2" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🎁</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Invite friends to Felcin</h1>
        <p style={{ color: "#a7b8b0", fontSize: 15, lineHeight: 1.5, margin: 0 }}>
          Felcin is better with your crew. Share your link — when a friend joins, they'll show up here.
        </p>
      </div>

      {/* Friends joined */}
      <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid var(--fx-accent, #22c55e)", borderRadius: 16, padding: "18px 16px", textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: "var(--fx-accent, #22c55e)", lineHeight: 1 }}>
          {count === null ? "—" : count}
        </div>
        <div style={{ fontSize: 13, color: "#a7b8b0", marginTop: 4 }}>
          {count === 1 ? "friend has joined" : "friends have joined"} with your link
        </div>
      </div>

      {/* Reward tiers */}
      <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#6e817a", marginBottom: 12, fontWeight: 600, letterSpacing: 0.3 }}>REWARDS</div>
        {(() => {
          const c = count ?? 0;
          const next = TIERS.find((t) => c < t.n);
          return (
            <>
              {next ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, color: "#f2f2f2", marginBottom: 7 }}>
                    <b>{next.n - c}</b> more to reach {next.emoji} <b>{next.label}</b>
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (c / next.n) * 100)}%`, background: "var(--fx-accent,#22c55e)", transition: "width .3s" }} />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13.5, color: "var(--fx-accent,#22c55e)", fontWeight: 700, marginBottom: 14 }}>⭐ You've maxed the tiers — you're a Felcin Ambassador!</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {TIERS.map((t) => {
                  const unlocked = c >= t.n;
                  return (
                    <div key={t.n} style={{ display: "flex", alignItems: "center", gap: 10, opacity: unlocked ? 1 : 0.5 }}>
                      <span style={{ fontSize: 18 }}>{t.emoji}</span>
                      <div style={{ flex: 1, fontSize: 13, color: "#f2f2f2" }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: unlocked ? "var(--fx-accent,#22c55e)" : "#6e817a", fontWeight: 600 }}>
                        {unlocked ? "Unlocked ✓" : `${t.n} friends`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Link + actions */}
      <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12, color: "#6e817a", marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>YOUR INVITE LINK</div>
        <div
          onClick={copy}
          style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 12px", fontSize: 13, color: "#cfe9dd", wordBreak: "break-all", cursor: "pointer", marginBottom: 12 }}
        >
          {link}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={share}
            style={{ flex: 1, background: "var(--fx-accent, #22c55e)", color: "#04140a", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Share link
          </button>
          <button
            onClick={copy}
            style={{ flex: "0 0 auto", background: "rgba(255,255,255,0.06)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "12px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      <p style={{ textAlign: "center", color: "#6e817a", fontSize: 12, marginTop: 18 }}>
        Tip: share it in your group chats, stories, and bio — that's where new members come from.
      </p>
    </div>
  );
}
