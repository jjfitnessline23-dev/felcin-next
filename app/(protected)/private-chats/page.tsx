"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface Chat { id: string; participants: string[]; lastMessage?: string; lastAt?: { seconds: number }; otherName?: string; otherPhoto?: string; }
interface Msg { id: string; senderId: string; text: string; createdAt?: { seconds: number }; }

function chatId(a: string, b: string) { return [a, b].sort().join("_"); }

function timeAgo(s: number) {
  const d = Math.floor(Date.now() / 1000) - s;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

export default function PrivateChatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const withUid = searchParams.get("uid");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !withUid || activeChat) return;
    setActiveChat(chatId(user.uid, withUid));
    getDoc(doc(db, "users", withUid, "public", "profile")).then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      if (data) { setOtherName(data.displayName || data.username || "User"); setOtherPhoto(data.photoURL || ""); return; }
      return getDoc(doc(db, "users", withUid)).then((root) => {
        if (root.exists()) { const d = root.data(); setOtherName(d.displayName || d.username || "User"); setOtherPhoto(d.photoURL || ""); }
      });
    }).catch(() => {});
  }, [user, withUid, activeChat]);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [otherName, setOtherName] = useState("Chat");
  const [otherPhoto, setOtherPhoto] = useState("");
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const presenceRef = doc(db, "users", user.uid, "presence", "status");
    setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const goOffline = () => updateDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    const handleVisibility = () => { if (document.visibilityState === "hidden") goOffline(); else setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {}); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", goOffline);
    return () => {
      goOffline();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [user]);

  useEffect(() => {
    if (!activeChat || !user) return;
    const otherUid = activeChat.split("_").find((id) => id !== user.uid);
    if (!otherUid) return;
    return onSnapshot(doc(db, "users", otherUid, "presence", "status"), (snap) => {
      if (snap.exists()) {
        setOtherOnline(snap.data().online === true);
        setOtherLastSeen(snap.data().lastSeen?.seconds ?? null);
      }
    }, () => {});
  }, [activeChat, user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid));
    return onSnapshot(q, async (snap) => {
      const cs: Chat[] = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data() as Chat;
        const otherId = data.participants.find((p) => p !== user.uid) || "";
        try {
          const pub = await getDoc(doc(db, "users", otherId, "public", "profile"));
          if (pub.exists()) { const pd = pub.data(); return { ...data, id: d.id, otherName: pd.displayName || pd.username || "User", otherPhoto: pd.photoURL || "" }; }
          const root = await getDoc(doc(db, "users", otherId));
          if (root.exists()) { const pd = root.data(); return { ...data, id: d.id, otherName: pd.displayName || pd.username || "User", otherPhoto: pd.photoURL || "" }; }
        } catch {}
        return { ...data, id: d.id };
      }));
      setChats(cs.sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0)));
    }, () => {});
  }, [user]);

  useEffect(() => {
    if (!activeChat) { setMessages([]); return; }
    const q = query(collection(db, "chats", activeChat, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, "id">) })));
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }, () => {});
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  }, [activeChat]);

  const sendMsg = async () => {
    if (!text.trim() || !user || !activeChat || sending) return;
    setSending(true); const t = text.trim(); setText("");
    try {
      await addDoc(collection(db, "chats", activeChat, "messages"), { senderId: user.uid, text: t, createdAt: serverTimestamp() });
      await setDoc(doc(db, "chats", activeChat), { participants: activeChat.split("_"), lastMessage: t, lastAt: serverTimestamp() }, { merge: true });
      const otherUid = activeChat.split("_").find((id) => id !== user.uid);
      if (otherUid) {
        addDoc(collection(db, "notifications"), {
          recipientId: otherUid, senderId: user.uid,
          senderName: user.displayName || "Someone",
          senderPhoto: user.photoURL || "",
          type: "message",
          message: t.length > 50 ? t.slice(0, 50) + "…" : t,
          read: false, createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch {}
    setSending(false);
  };

  const myInitial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();
  const hasText = text.trim().length > 0;

  return (
    <div className="private-chats-root flex overflow-hidden" style={{ background: "#090909" }}>

      {/* ── Chat list panel ── */}
      <div className={`shrink-0 flex flex-col ${
        activeChat
          ? chats.length > 0 ? "hidden lg:flex lg:w-80" : "hidden"
          : chats.length === 0 ? "w-full flex" : "w-full lg:w-80 flex"
      }`}
        style={{ borderRight: chats.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>

        {/* Header */}
        <div className="relative overflow-hidden shrink-0"
          style={{ background: "linear-gradient(135deg,#030e14 0%,#061820 100%)", borderBottom: "1px solid rgba(6,182,212,0.15)", paddingTop: "max(12px, env(safe-area-inset-top,12px) + 8px)" }}>
          <div className="absolute pointer-events-none" style={{ top: "-60%", right: "-20%", width: 240, height: 240, background: "radial-gradient(circle,rgba(6,182,212,0.18) 0%,transparent 70%)", animation: "heroGlow 5s ease-in-out infinite" }} />
          <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
            <img src="/static/logo-nav.svg" alt="" style={{ width: 80, opacity: 0.04, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(160deg)" }} />
          </div>
          <div className="relative flex items-center gap-3 px-4 pb-4">
            <button onClick={() => router.back()} className="icon-btn shrink-0" style={{ width: 36, height: 36, color: "#f2f2f2" }}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h1 className="font-black text-lg" style={{ color: "#f2f2f2", letterSpacing: -0.5 }}>Messages</h1>
              {chats.length > 0 && <p className="text-xs" style={{ color: "#06b6d4" }}>{chats.length} conversation{chats.length !== 1 ? "s" : ""}</p>}
            </div>
          </div>
        </div>

        {/* Chat list or empty */}
        {chats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div style={{ maxWidth: 400 }}>
              <div className="ghost-bg w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#06b6d4", opacity: 0.4 }}>chat</span>
              </div>
              <p className="font-bold text-base mb-2" style={{ color: "#f2f2f2" }}>No messages yet</p>
              <p className="text-sm" style={{ color: "#555" }}>Go to someone&apos;s profile and tap Message to start a chat.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {chats.map((c) => {
              const init = (c.otherName || "U").charAt(0).toUpperCase();
              const isActive = activeChat === c.id;
              return (
                <button key={c.id}
                  onClick={() => { setActiveChat(c.id); setOtherName(c.otherName || "User"); setOtherPhoto(c.otherPhoto || ""); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-3.5 transition-all"
                  style={{
                    background: isActive ? "linear-gradient(135deg,rgba(6,182,212,0.1),rgba(6,182,212,0.05))" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    borderLeft: isActive ? "2px solid #06b6d4" : "2px solid transparent",
                  }}>
                  <div className="relative shrink-0">
                    {c.otherPhoto ? (
                      <img src={c.otherPhoto} alt="" className="rounded-full object-cover" style={{ width: 46, height: 46, border: isActive ? "2px solid rgba(6,182,212,0.4)" : "2px solid transparent" }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                        style={{ width: 46, height: 46, background: isActive ? "rgba(6,182,212,0.15)" : "#1a1a1a", color: isActive ? "#06b6d4" : "#888", border: isActive ? "1px solid rgba(6,182,212,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
                        {init}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-bold text-sm" style={{ color: isActive ? "#f2f2f2" : "#d0d0d0" }}>{c.otherName || "User"}</p>
                      {c.lastAt?.seconds && <p className="text-xs" style={{ color: "#333" }}>{timeAgo(c.lastAt.seconds)}</p>}
                    </div>
                    {c.lastMessage && <p className="text-xs truncate" style={{ color: "#555" }}>{c.lastMessage}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Chat window ── */}
      {activeChat ? (
        <div className={`flex-1 flex flex-col ${!activeChat ? "hidden lg:flex" : ""}`}>

          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.97)", backdropFilter: "blur(20px)" }}>
            <button onClick={() => setActiveChat(null)} className="icon-btn lg:hidden" style={{ width: 36, height: 36, color: "#f2f2f2" }}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="relative">
              {otherPhoto ? (
                <img src={otherPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ width: 36, height: 36, background: "#1a1a1a", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {otherName.charAt(0).toUpperCase()}
                </div>
              )}
              {otherOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: "#22c55e", border: "2px solid #090909" }} />
              )}
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>{otherName}</p>
              {otherOnline
                ? <p className="text-xs flex items-center gap-1" style={{ color: "#22c55e" }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} /> Online now
                  </p>
                : otherLastSeen
                  ? <p className="text-xs" style={{ color: "#444" }}>Active {timeAgo(otherLastSeen)}</p>
                  : null}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5" style={{ position: "relative" }}>

            {/* Ghost watermark */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", overflow: "hidden" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style={{ width: 200, height: 200, opacity: 0.025 }}>
                <path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white"/>
                <circle cx="24" cy="29" r="4.5" fill="#090909"/>
                <circle cx="40" cy="29" r="4.5" fill="#090909"/>
                <path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36"
                  fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "32px 16px", gap: 20, position: "relative", zIndex: 1 }}>

                {/* Ghost icon */}
                <div style={{ position: "relative", width: 72, height: 72 }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)", animation: "ghostPulse 3s ease-in-out infinite" }} />
                  <div style={{ width: "100%", height: "100%", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
                      <path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="rgba(168,85,247,0.6)"/>
                      <circle cx="24" cy="29" r="4.5" fill="#090909"/>
                      <circle cx="40" cy="29" r="4.5" fill="#090909"/>
                      <path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36"
                        fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: "#f2f2f2", marginBottom: 4 }}>{otherName}</p>
                  <p style={{ fontSize: 13, color: "#555" }}>Say hello 👋</p>
                </div>

                {/* Ghost sayings */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 240 }}>
                  {[
                    { emoji: "👻", text: "The Ghost is listening..." },
                    { emoji: "⚡", text: "Train together, even apart." },
                    { emoji: "🔥", text: "Every great session starts with a message." },
                  ].map((s) => (
                    <div key={s.text} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 16, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.1)" }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{s.emoji}</span>
                      <span style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isMine = m.senderId === user?.uid;
              const prevSame = i > 0 && messages[i-1].senderId === m.senderId;
              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`} style={{ marginTop: prevSame ? 2 : 8 }}>
                  <div className="max-w-[72%] px-4 py-2.5 text-sm leading-relaxed" style={{
                    background: isMine
                      ? "linear-gradient(135deg,#7C3AED,#a855f7)"
                      : "linear-gradient(135deg,#1a1a2a,#131320)",
                    color: isMine ? "#fff" : "#e0e0e0",
                    borderRadius: isMine
                      ? (prevSame ? "18px 6px 6px 18px" : "18px 18px 6px 18px")
                      : (prevSame ? "6px 18px 18px 6px" : "18px 18px 18px 6px"),
                    boxShadow: isMine ? "0 4px 16px rgba(124,58,237,0.3)" : "none",
                    border: isMine ? "none" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-3 lg:pb-4 shrink-0 nav-composer"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.97)", backdropFilter: "blur(20px)" }}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ width: 32, height: 32, background: "#1a1a1a", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>
                {myInitial}
              </div>
            )}
            <input type="text" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 350)}
              placeholder="Type a message…"
              className="flex-1 px-4 py-2.5 rounded-full outline-none transition-all"
              style={{
                background: hasText ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${hasText ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.08)"}`,
                color: "#f2f2f2", fontSize: 16,
              }} />
            <button onClick={sendMsg} disabled={!hasText || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer transition-all shrink-0"
              style={{
                background: hasText ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "rgba(255,255,255,0.05)",
                boxShadow: hasText ? "0 0 16px rgba(124,58,237,0.4)" : "none",
                color: hasText ? "#fff" : "#444",
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 19, fontVariationSettings: "'FILL' 1" }}>send</span>
            </button>
          </div>
        </div>
      ) : chats.length > 0 ? (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-3">
          <div className="ghost-bg w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#2a2a2a" }}>chat</span>
          </div>
          <p className="font-medium text-sm" style={{ color: "#333" }}>Select a conversation</p>
        </div>
      ) : null}
    </div>
  );
}
