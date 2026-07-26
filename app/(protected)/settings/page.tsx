"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StripeCheckoutModal from "@/components/StripeCheckoutModal";

interface BlockedUser { uid: string; displayName?: string; photoURL?: string; }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative flex-shrink-0 border-none cursor-pointer"
      style={{ width: 44, height: 26, borderRadius: 13, background: on ? "#fff" : "rgba(255,255,255,0.12)", transition: "background 0.2s", padding: 0 }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: "50%",
        background: on ? "#000" : "#666",
        transition: "left 0.2s",
        display: "block",
      }} />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold tracking-widest px-4 mb-2" style={{ color: "#444" }}>{title.toUpperCase()}</p>
      <div className="rounded-2xl overflow-hidden mx-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, sub, right, danger, onPress, href }: {
  icon: string; label: string; sub?: string; right?: React.ReactNode;
  danger?: boolean; onPress?: () => void; href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.06)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: danger ? "#ef4444" : "#888" }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? "#f87171" : "#f2f2f2" }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "#555" }}>{sub}</p>}
      </div>
      {right ?? (href || onPress ? <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#333" }}>chevron_right</span> : null)}
    </div>
  );

  if (href) return <Link href={href} className="block first:border-t-0">{inner}</Link>;
  if (onPress) return <button onClick={onPress} className="w-full text-left border-none bg-transparent cursor-pointer first:border-t-0">{inner}</button>;
  return <div className="first:border-t-0">{inner}</div>;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus(); el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {}
  return false;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumSecret, setPremiumSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "settings", "premium")).then((snap) => {
      if (snap.exists() && snap.data()?.active) setIsPremium(true);
    }).catch(() => {});
  }, [user]);

  const startPremium = async (plan: "monthly" | "yearly") => {
    if (!user || premiumLoading) return;
    setPremiumLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/premium-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, token }) });
      const data = await res.json();
      if (data.clientSecret) setPremiumSecret(data.clientSecret);
    } catch {}
    setPremiumLoading(false);
  };

  // Privacy
  const [privateAccount, setPrivateAccount] = useState(false);
  const [allowMessages, setAllowMessages] = useState(true);

  // Notifications
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifReposts, setNotifReposts] = useState(true);
  const [notifLive, setNotifLive] = useState(true);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "settings", "preferences")).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setPrivateAccount(d.privateAccount ?? false);
      setAllowMessages(d.allowMessages ?? true);
      setNotifLikes(d.notifLikes ?? true);
      setNotifComments(d.notifComments ?? true);
      setNotifFollows(d.notifFollows ?? true);
      setNotifReposts(d.notifReposts ?? true);
      setNotifLive(d.notifLive ?? true);
    }).catch(() => {});
  }, [user]);

  // Load blocked users
  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, "users", user.uid, "blocked")).then(async (snap) => {
      const uids = snap.docs.map((d) => d.id);
      const users = await Promise.all(uids.map(async (uid) => {
        try {
          const pub = await getDoc(doc(db, "users", uid, "public", "profile"));
          if (pub.exists()) { const d = pub.data(); return { uid, displayName: d.displayName || d.username || "User", photoURL: d.photoURL || "" }; }
          const root = await getDoc(doc(db, "users", uid));
          if (root.exists()) { const d = root.data(); return { uid, displayName: d.displayName || "User", photoURL: d.photoURL || "" }; }
        } catch {}
        return { uid, displayName: "User" };
      }));
      setBlockedUsers(users.filter(Boolean) as BlockedUser[]);
      setBlockedLoading(false);
    }).catch(() => setBlockedLoading(false));
  }, [user]);

  const savePref = async (key: string, value: boolean) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "settings", "preferences"), { [key]: value }, { merge: true }).catch(() => {});
  };

  const toggle = (setter: (v: boolean) => void, key: string, value: boolean) => {
    setter(value);
    savePref(key, value);
  };

  const unblock = async (uid: string) => {
    if (!user || unblocking) return;
    setUnblocking(uid);
    await Promise.all([
      deleteDoc(doc(db, "users", user.uid, "blocked", uid)),
      deleteDoc(doc(db, "users", uid, "blockedBy", user.uid)),
    ]).catch(() => {});
    setBlockedUsers((prev) => prev.filter((u) => u.uid !== uid));
    setUnblocking(null);
  };

  return (
    <div className="max-w-xl mx-auto pb-10">
      <PageHeader title="Settings" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0a0515 0%,#130a22 50%,#0a0515 100%)", border: "1px solid rgba(167,139,250,0.2)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.2) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>settings</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>SETTINGS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Your Account</h1>
          <p className="text-sm" style={{ color: "#555" }}>{user?.email || "Manage your Felcin account"}</p>
          {isPremium && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>Premium Active</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-2">

        {/* Premium */}
        <div className="mb-6 mx-4">
          <div className="rounded-2xl p-5" style={{ background: isPremium ? "rgba(251,191,36,0.08)" : "#131313", border: `1px solid ${isPremium ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.07)"}` }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>Felcin Premium</p>
                <p className="text-xs" style={{ color: "#555" }}>No ads · Premium badge · Early access</p>
              </div>
              {isPremium && <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>Active</span>}
            </div>
            {!isPremium && (
              <div className="flex gap-2">
                <button onClick={() => startPremium("monthly")} disabled={premiumLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.07)", color: "#f2f2f2" }}>
                  $9.99 / mo
                </button>
                <button onClick={() => startPremium("yearly")} disabled={premiumLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: "#fbbf24", color: "#000" }}>
                  $79.99 / yr
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Invite Friends */}
        <div className="mb-6 mx-4">
          <div className="rounded-2xl p-5" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(52,211,153,0.12)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#34d399", fontVariationSettings: "'FILL' 1" }}>group_add</span>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>Invite Friends to Felcin</p>
                <p className="text-xs" style={{ color: "#555" }}>Share your profile and grow together</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span className="text-xs flex-1 truncate" style={{ color: "#666" }}>
                felcin.com/user-profile?uid={user?.uid?.slice(0, 8)}…
              </span>
              <button
                onClick={async () => {
                  const link = `https://felcin.com/user-profile?uid=${user?.uid}`;
                  const ok = await copyToClipboard(link);
                  if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
                }}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border-none cursor-pointer shrink-0 transition-colors"
                style={{ background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)", color: copied ? "#34d399" : "#aaa" }}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => {
                const link = `https://felcin.com/user-profile?uid=${user?.uid}`;
                const msg = `Join me on Felcin — the fitness platform where you train together!\n${link}`;
                if (navigator.share) navigator.share({ text: msg, url: link }).catch(() => {});
                else navigator.clipboard?.writeText(msg).catch(() => {});
              }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer flex items-center justify-center gap-2"
              style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>ios_share</span>
              Share Invite Link
            </button>
          </div>
        </div>

        {/* Account */}
        <Section title="Account">
          <Row icon="person" label="Edit Profile" sub="Update your name, bio, and photo" href="/profile-settings" />
          <Row icon="verified_user" label="Account type" sub={privateAccount ? "Private" : "Public"} right={<Toggle on={privateAccount} onChange={(v) => { setPrivateAccount(v); savePref("privateAccount", v); updateDoc(doc(db, "users", user!.uid), { isPrivate: v }).catch(() => {}); }} />} />
          <Row icon="chat" label="Allow messages" sub="Let anyone send you messages" right={<Toggle on={allowMessages} onChange={(v) => toggle(setAllowMessages, "allowMessages", v)} />} />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Row icon="favorite" label="Likes" right={<Toggle on={notifLikes} onChange={(v) => toggle(setNotifLikes, "notifLikes", v)} />} />
          <Row icon="chat_bubble" label="Comments" right={<Toggle on={notifComments} onChange={(v) => toggle(setNotifComments, "notifComments", v)} />} />
          <Row icon="person_add" label="New followers" right={<Toggle on={notifFollows} onChange={(v) => toggle(setNotifFollows, "notifFollows", v)} />} />
          <Row icon="repeat" label="Reposts" right={<Toggle on={notifReposts} onChange={(v) => toggle(setNotifReposts, "notifReposts", v)} />} />
          <Row icon="sensors" label="Live streams" right={<Toggle on={notifLive} onChange={(v) => toggle(setNotifLive, "notifLive", v)} />} />
        </Section>

        {/* Blocked Users */}
        <Section title="Blocked Users">
          {blockedLoading ? (
            <div className="flex justify-center py-5"><div className="spinner" /></div>
          ) : blockedUsers.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm" style={{ color: "#555" }}>No blocked accounts</p>
            </div>
          ) : (
            blockedUsers.map((u) => {
              const init = (u.displayName || "U").charAt(0).toUpperCase();
              return (
                <div key={u.uid} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {u.photoURL
                    ? <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 38, height: 38 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ width: 38, height: 38, background: "#222", color: "#aaa" }}>{init}</div>}
                  <p className="flex-1 text-sm font-medium truncate" style={{ color: "#f2f2f2" }}>{u.displayName}</p>
                  <button onClick={() => unblock(u.uid)} disabled={unblocking === u.uid}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.08)", color: "#aaa" }}>
                    {unblocking === u.uid ? "…" : "Unblock"}
                  </button>
                </div>
              );
            })
          )}
        </Section>

        {/* Support & Legal */}
        <Section title="Support & Legal">
          <Row icon="help" label="Help & Support" href="/support" />
          <Row icon="privacy_tip" label="Privacy Policy" href="/privacy" />
          <Row icon="description" label="Terms of Service" href="/terms" />
          <Row icon="rule" label="Community Guidelines" href="/guidelines" />
        </Section>

        {/* Danger zone */}
        <Section title="Account Actions">
          <Row icon="logout" label="Sign out" danger onPress={async () => { await signOut(); router.replace("/login"); }} />
          <Row icon="delete_forever" label="Delete Account" sub="Permanently remove your account" danger href="/profile-settings#delete" />
        </Section>

        <p className="text-xs text-center pb-6 mt-2" style={{ color: "#2a2a2a" }}>Felcin © {new Date().getFullYear()}</p>
      </div>

      {premiumSecret && (
        <StripeCheckoutModal
          fetchClientSecret={async () => premiumSecret}
          onClose={() => setPremiumSecret(null)}
          onComplete={() => {
            const sessionId = premiumSecret.split("_secret_")[0];
            setPremiumSecret(null);
            fetch(`/api/premium-verify?session_id=${sessionId}`)
              .then((r) => r.json())
              .then((d) => { if (d.ok) setIsPremium(true); })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
