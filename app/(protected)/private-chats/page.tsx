"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from "@/lib/db";
import { db, storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";

interface Chat { id: string; participants: string[]; lastMessage?: string; lastAt?: { seconds: number }; otherName?: string; otherPhoto?: string; }
interface Msg { id: string; senderId: string; text?: string; type?: "text" | "image" | "audio"; imageUrl?: string; audioUrl?: string; createdAt?: { seconds: number }; }

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
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [containerH, setContainerH] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [otherName, setOtherName] = useState("Chat");
  const [otherPhoto, setOtherPhoto] = useState("");
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Presence
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

  // Other user's presence
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

  // Chat list
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

  // Container height — driven by visualViewport.
  //
  // capacitor.config.json uses resize:"none", so iOS handles keyboard natively:
  // the WKWebView visual viewport shrinks when the keyboard opens, firing
  // visualViewport "resize". We set the container height to
  // visualViewport.height - containerTop so the input bar always sits exactly
  // above the keyboard. window "resize" catches the same event on web browsers.
  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport;
      const vvh = vv ? vv.height : window.innerHeight;
      const top = containerRef.current?.getBoundingClientRect().top ?? 0;
      const h = vvh - top;
      if (h > 100) {
        setContainerH(h);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 80);
      }
    };

    update();

    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);

    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Messages
  useEffect(() => {
    if (!activeChat) { setMessages([]); return; }
    const q = query(collection(db, "chats", activeChat, "messages"));
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, "id">) }))
        .sort((a, b) => (a.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER));
      setMessages(sorted);
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }, () => {});
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  }, [activeChat]);

  const sendMsg = async () => {
    if (!text.trim() || !user || !activeChat || sending) return;
    setSending(true); const t = text.trim(); setText("");
    try {
      await setDoc(doc(db, "chats", activeChat), { participants: activeChat.split("_"), lastMessage: t, lastAt: serverTimestamp() }, { merge: true });
      await addDoc(collection(db, "chats", activeChat, "messages"), { senderId: user.uid, type: "text", text: t, createdAt: serverTimestamp() });
      const otherUid = activeChat.split("_").find((id) => id !== user.uid);
      if (otherUid) {
        const preview = t.length > 50 ? t.slice(0, 50) + "…" : t;
        addDoc(collection(db, "notifications"), { recipientId: otherUid, senderId: user.uid, senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "", type: "message", message: preview, read: false, createdAt: serverTimestamp() }).catch(() => {});
        sendNotification({ recipientUid: otherUid, type: "message", senderName: user.displayName || "Someone", senderId: user.uid, message: preview });
      }
    } catch { setText(t); }
    setSending(false);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !activeChat) return;
    setUploading(true);
    try {
      const sRef = storageRef(storage, `chat-media/${activeChat}/${Date.now()}-${user.uid}`);
      const snapshot = await uploadBytes(sRef, file);
      const url = await getDownloadURL(snapshot.ref);
      await setDoc(doc(db, "chats", activeChat), { participants: activeChat.split("_"), lastMessage: "📷 Photo", lastAt: serverTimestamp() }, { merge: true });
      await addDoc(collection(db, "chats", activeChat, "messages"), { senderId: user.uid, type: "image", imageUrl: url, createdAt: serverTimestamp() });
      const otherUid = activeChat.split("_").find((id) => id !== user.uid);
      if (otherUid) {
        addDoc(collection(db, "notifications"), { recipientId: otherUid, senderId: user.uid, senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "", type: "message", message: "📷 Photo", read: false, createdAt: serverTimestamp() }).catch(() => {});
        sendNotification({ recipientUid: otherUid, type: "message", senderName: user.displayName || "Someone", senderId: user.uid, message: "📷 Photo" });
      }
    } catch {}
    setUploading(false);
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (!user || !activeChat || blob.size < 500) return;
        setUploading(true);
        try {
          const sRef = storageRef(storage, `chat-audio/${activeChat}/${Date.now()}-${user.uid}.webm`);
          const snapshot = await uploadBytes(sRef, blob);
          const url = await getDownloadURL(snapshot.ref);
          await setDoc(doc(db, "chats", activeChat), { participants: activeChat.split("_"), lastMessage: "🎤 Voice message", lastAt: serverTimestamp() }, { merge: true });
          await addDoc(collection(db, "chats", activeChat, "messages"), { senderId: user.uid, type: "audio", audioUrl: url, createdAt: serverTimestamp() });
          const otherUid = activeChat.split("_").find((id) => id !== user.uid);
          if (otherUid) {
            addDoc(collection(db, "notifications"), { recipientId: otherUid, senderId: user.uid, senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "", type: "message", message: "🎤 Voice message", read: false, createdAt: serverTimestamp() }).catch(() => {});
            sendNotification({ recipientUid: otherUid, type: "message", senderName: user.displayName || "Someone", senderId: user.uid, message: "🎤 Voice message" });
          }
        } catch {}
        setUploading(false);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {}
  };

  const myInitial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();
  const hasText = text.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className="private-chats-root flex overflow-hidden"
      style={{
        background: "#090909",
        // position:fixed so the chat sits between the status bar and keyboard.
        // Height is measured in JS from body.clientHeight (which Capacitor's
        // resize:"body" shrinks when the keyboard opens) minus containerTop.
        // This means no Capacitor keyboard events are needed at all.
        // Desktop (lg:): overridden to static flow by the globals.css media query.
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        height: containerH ? `${containerH}px` : "calc(100dvh - env(safe-area-inset-top, 0px))",
      }}
    >

      {/* ── Chat list panel ── */}
      <div className={`shrink-0 flex flex-col ${
        activeChat
          ? chats.length > 0 ? "hidden lg:flex lg:w-80" : "hidden"
          : chats.length === 0 ? "w-full flex" : "w-full lg:w-80 flex"
      }`}
        style={{ borderRight: chats.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>

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
        <div className={`flex-1 flex flex-col min-w-0 ${!activeChat ? "hidden lg:flex" : ""}`}>

          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.97)", backdropFilter: "blur(20px)", paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}>
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

          {/* Messages — flex-1 + overflow-y-auto = only this area scrolls */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ position: "relative" }}>

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

            <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "16px", gap: "6px" }}>

              {messages.length === 0 && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 20, position: "relative", zIndex: 1 }}>
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
                const prevSame = i > 0 && messages[i - 1].senderId === m.senderId;
                const msgType = m.type || "text";
                const bubbleRadius = isMine
                  ? (prevSame ? "18px 6px 6px 18px" : "18px 18px 6px 18px")
                  : (prevSame ? "6px 18px 18px 6px" : "18px 18px 18px 6px");

                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`} style={{ marginTop: prevSame ? 2 : 8 }}>
                    {msgType === "image" ? (
                      <img
                        src={m.imageUrl}
                        alt="Photo"
                        onClick={() => m.imageUrl && window.open(m.imageUrl, "_blank")}
                        style={{ maxWidth: "72%", maxHeight: 280, borderRadius: bubbleRadius, objectFit: "cover", cursor: "pointer", display: "block" }}
                      />
                    ) : msgType === "audio" ? (
                      <div style={{
                        padding: "10px 14px",
                        background: isMine ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "linear-gradient(135deg,#1a1a2a,#131320)",
                        borderRadius: bubbleRadius,
                        border: isMine ? "none" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: isMine ? "0 4px 16px rgba(124,58,237,0.3)" : "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: isMine ? "#fff" : "#a855f7", fontVariationSettings: "'FILL' 1" }}>mic</span>
                          <audio controls src={m.audioUrl} style={{ height: 28, maxWidth: 180 }} />
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[72%] px-4 py-2.5 text-sm leading-relaxed" style={{
                        background: isMine ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "linear-gradient(135deg,#1a1a2a,#131320)",
                        color: isMine ? "#fff" : "#e0e0e0",
                        borderRadius: bubbleRadius,
                        boxShadow: isMine ? "0 4px 16px rgba(124,58,237,0.3)" : "none",
                        border: isMine ? "none" : "1px solid rgba(255,255,255,0.06)",
                      }}>
                        {m.text}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="shrink-0 nav-composer" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.97)", backdropFilter: "blur(20px)" }}>

            {/* Recording indicator */}
            {recording && (
              <div className="flex items-center gap-2 px-4 pt-2" style={{ color: "#ef4444", fontSize: 12 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s ease-in-out infinite" }} />
                Recording… tap mic to send
              </div>
            )}

            <div className="flex items-center gap-2 px-3 pt-2 pb-3 lg:pb-4">
              {/* Avatar */}
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 30, height: 30 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ width: 30, height: 30, background: "#1a1a1a", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {myInitial}
                </div>
              )}

              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

              {/* Photo button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording || sending}
                className="shrink-0 flex items-center justify-center rounded-full transition-all"
                style={{ width: 36, height: 36, background: "rgba(255,255,255,0.05)", color: "#888", border: "none", cursor: "pointer" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>image</span>
              </button>

              {/* Text input (hidden while recording) */}
              {!recording && (
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                  onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 350)}
                  placeholder="Type a message…"
                  className="flex-1 px-4 py-2.5 rounded-full outline-none transition-all"
                  style={{
                    background: hasText ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.12)",
                    border: `1px solid ${hasText ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.2)"}`,
                    color: "#f2f2f2",
                    fontSize: 16,
                    minWidth: 0,
                  }}
                />
              )}

              {/* Recording placeholder (takes same space as text input) */}
              {recording && (
                <div className="flex-1 px-4 py-2.5 rounded-full flex items-center gap-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", minWidth: 0 }}>
                  <span style={{ color: "#ef4444", fontSize: 13 }}>Recording…</span>
                </div>
              )}

              {/* Mic button — shown when no text is typed */}
              {!hasText && !uploading && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: recording ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                    boxShadow: recording ? "0 0 14px rgba(239,68,68,0.4)" : "none",
                    color: recording ? "#ef4444" : "#888",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 19, fontVariationSettings: "'FILL' 1" }}>
                    {recording ? "stop_circle" : "mic"}
                  </span>
                </button>
              )}

              {/* Send button — shown when text is typed */}
              {hasText && !uploading && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); sendMsg(); }}
                  disabled={sending}
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: "linear-gradient(135deg,#7C3AED,#a855f7)",
                    boxShadow: "0 0 16px rgba(124,58,237,0.4)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 19, fontVariationSettings: "'FILL' 1" }}>send</span>
                </button>
              )}

              {/* Upload spinner */}
              {uploading && (
                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="spinner" style={{ width: 18, height: 18 }} />
                </div>
              )}
            </div>
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
