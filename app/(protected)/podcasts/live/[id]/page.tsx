"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc, increment, collection, addDoc, query, orderBy, limit, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface LiveShow {
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  title?: string;
  listenerCount?: number;
  status?: string;
}

interface ChatMsg {
  id: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  ts: number;
}

export default function LivePodcastPage() {
  const params = useParams();
  const router = useRouter();
  const showId = params.id as string;
  const { user } = useAuth();

  const [show, setShow] = useState<LiveShow | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [endingShow, setEndingShow] = useState(false);
  const [joined, setJoined] = useState(false);

  const isHost = user?.uid === show?.hostId;

  // Subscribe to show
  useEffect(() => {
    return onSnapshot(doc(db, "livePodcasts", showId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LiveShow;
        setShow(data);
        if (data.status === "ended") router.replace("/podcasts");
      } else {
        router.replace("/podcasts");
      }
      setLoading(false);
    }, () => setLoading(false));
  }, [showId, router]);

  // Increment listener count once on join
  useEffect(() => {
    if (!user || isHost || joined || !show) return;
    setJoined(true);
    updateDoc(doc(db, "livePodcasts", showId), { listenerCount: increment(1) }).catch(() => {});
    return () => {
      updateDoc(doc(db, "livePodcasts", showId), { listenerCount: increment(-1) }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, show]);

  // Live chat
  useEffect(() => {
    const q = query(
      collection(db, "livePodcasts", showId, "chat"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, senderName: data.senderName ?? "User", senderPhoto: data.senderPhoto, text: data.text ?? "", ts: data.timestamp?.seconds ?? 0 };
      }).reverse());
    }, () => {});
  }, [showId]);

  async function sendChat() {
    if (!user || !chatText.trim() || sending) return;
    setSending(true);
    await addDoc(collection(db, "livePodcasts", showId, "chat"), {
      senderId: user.uid,
      senderName: user.displayName || "User",
      senderPhoto: user.photoURL || null,
      text: chatText.trim(),
      timestamp: serverTimestamp(),
    }).catch(() => {});
    setChatText("");
    setSending(false);
  }

  async function endShow() {
    if (!user || endingShow) return;
    setEndingShow(true);
    await updateDoc(doc(db, "livePodcasts", showId), { status: "ended" }).catch(() => {});
    router.push("/podcasts");
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!show) return null;

  const init = (show.hostName || "H").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/podcasts" className="inline-flex items-center gap-1 text-sm mb-5" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Podcasts
      </Link>

      {/* Host card */}
      <div className="rounded-2xl p-5 mb-4"
        style={{ background: "#131313", border: "1px solid rgba(239,68,68,0.2)" }}>
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {show.hostPhoto ? (
              <img src={show.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 64, height: 64 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center font-bold text-xl"
                style={{ width: 64, height: 64, background: "#222", color: "#aaa" }}>{init}</div>
            )}
            <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "#ef4444" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "pulse 1.5s infinite" }} />
              <span className="text-white text-xs font-bold">LIVE</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold" style={{ color: "#f2f2f2" }}>{show.hostName}</p>
            {show.title && <p className="text-sm mt-0.5" style={{ color: "#888" }}>{show.title}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#555" }}>headphones</span>
              <span className="text-xs" style={{ color: "#555" }}>{show.listenerCount ?? 0} listening</span>
            </div>
          </div>
        </div>

        {/* Animated sound bars */}
        <div className="flex items-end justify-center gap-1 mt-5 mb-2" style={{ height: 40 }}>
          {[0.4,0.7,1,0.6,0.9,0.5,0.8,0.3,0.7,0.5,0.9,0.4].map((h, i) => (
            <div key={i} className="rounded-full" style={{
              width: 4, background: "#ef4444", opacity: 0.7,
              animation: `soundBar ${0.6 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
              height: `${h * 36}px`,
            }} />
          ))}
        </div>
        <style>{`
          @keyframes soundBar {
            from { transform: scaleY(0.3); }
            to   { transform: scaleY(1); }
          }
        `}</style>

        {isHost && (
          <button onClick={endShow} disabled={endingShow}
            className="w-full mt-4 py-3 rounded-xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
            {endingShow
              ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Ending…</>
              : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>stop_circle</span> End Podcast</>}
          </button>
        )}
      </div>

      {/* Live chat */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-bold" style={{ color: "#555" }}>LIVE CHAT</p>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto" style={{ minHeight: 200, maxHeight: 320 }}>
          {messages.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "#444" }}>No messages yet — say hi!</p>
          ) : messages.map((msg) => {
            const mi = (msg.senderName || "U").charAt(0).toUpperCase();
            return (
              <div key={msg.id} className="flex items-start gap-2.5">
                {msg.senderPhoto ? (
                  <img src={msg.senderPhoto} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: 26, height: 26 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ width: 26, height: 26, background: "#222", color: "#aaa" }}>{mi}</div>
                )}
                <div>
                  <span className="text-xs font-semibold mr-1.5" style={{ color: "#888" }}>{msg.senderName}</span>
                  <span className="text-sm" style={{ color: "#f2f2f2" }}>{msg.text}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="text"
            placeholder="Say something…"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
            maxLength={200}
            className="flex-1 px-3 py-2 rounded-xl outline-none text-sm"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }}
          />
          <button onClick={sendChat} disabled={!chatText.trim() || sending}
            className="w-9 h-9 rounded-xl flex items-center justify-center border-none cursor-pointer flex-shrink-0"
            style={{ background: chatText.trim() ? "#f2f2f2" : "rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: chatText.trim() ? "#000" : "#444" }}>send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
