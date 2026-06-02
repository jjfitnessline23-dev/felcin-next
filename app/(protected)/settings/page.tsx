"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

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

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

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

      <div className="pt-5">

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
    </div>
  );
}
