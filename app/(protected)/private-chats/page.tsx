"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc } from "firebase/firestore";
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
  const searchParams = useSearchParams();
  const withUid = searchParams.get("uid");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(withUid ? chatId(user?.uid || "", withUid) : null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [otherName, setOtherName] = useState("Chat");
  const [otherPhoto, setOtherPhoto] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid));
    return onSnapshot(q, async (snap) => {
      const cs: Chat[] = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data() as Chat;
        const otherId = data.participants.find((p) => p !== user.uid) || "";
        try {
          const pub = await getDoc(doc(db, "users", otherId, "public", "profile"));
          if (pub.exists()) {
            const pd = pub.data();
            return { ...data, id: d.id, otherName: pd.displayName || pd.username || "User", otherPhoto: pd.photoURL || "" };
          }
          const root = await getDoc(doc(db, "users", otherId));
          if (root.exists()) {
            const pd = root.data();
            return { ...data, id: d.id, otherName: pd.displayName || pd.username || "User", otherPhoto: pd.photoURL || "" };
          }
        } catch {}
        return { ...data, id: d.id };
      }));
      setChats(cs.sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0)));
    });
  }, [user]);

  useEffect(() => {
    if (!activeChat) { setMessages([]); return; }
    const q = query(collection(db, "chats", activeChat, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, "id">) })));
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    });
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  }, [activeChat]);

  const sendMsg = async () => {
    if (!text.trim() || !user || !activeChat || sending) return;
    setSending(true); const t = text.trim(); setText("");
    try {
      await addDoc(collection(db, "chats", activeChat, "messages"), { senderId: user.uid, text: t, createdAt: serverTimestamp() });
      await setDoc(doc(db, "chats", activeChat), { participants: activeChat.split("_"), lastMessage: t, lastAt: serverTimestamp() }, { merge: true });
    } catch {}
    setSending(false);
  };

  const myInitial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="flex overflow-hidden" style={{ height: "100dvh", background: "#090909", maxWidth: "100vw" }}>
      {/* Chat list */}
      <div className={`w-full lg:w-80 shrink-0 flex flex-col ${activeChat ? "hidden lg:flex" : "flex"}`}
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h1 className="font-bold text-lg" style={{ color: "#f2f2f2" }}>Messages</h1>
        </div>

        {chats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#333" }}>chat</span>
              </div>
              <p className="font-medium mb-1" style={{ color: "#f2f2f2" }}>No conversations</p>
              <p className="text-sm" style={{ color: "#444" }}>Start chatting from someone's profile</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {chats.map((c) => {
              const init = (c.otherName || "U").charAt(0).toUpperCase();
              return (
                <button key={c.id}
                  onClick={() => { setActiveChat(c.id); setOtherName(c.otherName || "User"); setOtherPhoto(c.otherPhoto || ""); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 transition-colors"
                  style={{ background: activeChat === c.id ? "rgba(255,255,255,0.06)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {c.otherPhoto ? (
                    <img src={c.otherPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 46, height: 46 }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ width: 46, height: 46, background: "#222", color: "#aaa" }}>
                      {init}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{c.otherName || "User"}</p>
                      {c.lastAt?.seconds && <p className="text-xs" style={{ color: "#444" }}>{timeAgo(c.lastAt.seconds)}</p>}
                    </div>
                    {c.lastMessage && <p className="text-xs truncate" style={{ color: "#555" }}>{c.lastMessage}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat window */}
      {activeChat ? (
        <div className={`flex-1 flex flex-col ${!activeChat ? "hidden lg:flex" : ""}`}>
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)" }}>
            <button onClick={() => setActiveChat(null)}
              className="icon-btn lg:hidden" style={{ width: 36, height: 36, color: "#f2f2f2" }}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            {otherPhoto ? (
              <img src={otherPhoto} alt="" className="rounded-full object-cover" style={{ width: 34, height: 34 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center font-bold text-sm"
                style={{ width: 34, height: 34, background: "#222", color: "#aaa" }}>
                {otherName.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="font-semibold" style={{ color: "#f2f2f2" }}>{otherName}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {messages.map((m) => {
              const isMine = m.senderId === user?.uid;
              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[72%] px-4 py-2.5 text-sm" style={{
                    background: isMine ? "#fff" : "#1a1a1a",
                    color: isMine ? "#000" : "#f2f2f2",
                    borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)" }}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ width: 32, height: 32, background: "#222", color: "#aaa" }}>
                {myInitial}
              </div>
            )}
            <input type="text" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              placeholder="Type a message…"
              className="flex-1 px-4 py-2.5 rounded-full outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }} />
            <button onClick={sendMsg} disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer transition-all"
              style={{ background: text.trim() ? "#fff" : "rgba(255,255,255,0.06)", color: text.trim() ? "#000" : "#555" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 19, fontVariationSettings: "'FILL' 1" }}>send</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-3">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#333" }}>chat</span>
          </div>
          <p className="font-medium" style={{ color: "#444" }}>Select a conversation</p>
        </div>
      )}
    </div>
  );
}
