"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { db, doc, onSnapshot } from "@/lib/db";

const RunMap = dynamic(() => import("@/components/RunMap"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%", background: "#090909" }} />,
});

interface LiveSession {
  uid: string;
  displayName: string;
  photoURL?: string;
  lat: number;
  lng: number;
  distance: number;
  elapsed: number;
  active: boolean;
  startedAt?: any;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}
function formatPace(secs: number, dist: number) {
  if (!dist || dist < 100) return "--:--";
  const s = secs / (dist / 1000);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function LiveRunPage() {
  const params = useParams();
  const shareId = params?.shareId as string;

  const [session, setSession] = useState<LiveSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!shareId) return;
    const unsub = onSnapshot(
      doc(db, "runLiveSessions", shareId),
      (snap) => {
        if (!snap.exists()) { setNotFound(true); return; }
        const data = snap.data() as LiveSession;
        setSession(data);
        setElapsed(data.elapsed || 0);
      },
      () => setNotFound(true)
    );
    return () => unsub();
  }, [shareId]);

  // Tick elapsed time locally so it doesn't depend on Firestore writes
  useEffect(() => {
    if (!session?.active) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session?.active]);

  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#222" }}>route</span>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#f2f2f2" }}>Run not found</p>
        <p style={{ fontSize: 13, color: "#444" }}>This link may have expired or the run has ended.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#222", animation: "spin 1s linear infinite" }}>sync</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const pos = { lat: session.lat, lng: session.lng };
  const initial = session.displayName?.charAt(0).toUpperCase() || "?";

  return (
    <div style={{ minHeight: "100dvh", background: "#090909", position: "relative" }}>

      {/* Full-screen map */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <RunMap
          coords={[pos]}
          currentPos={pos}
          followUser={session.active}
          fullscreen={true}
        />
      </div>

      {/* Top runner card */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 20,
        padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px 14px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 80%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Avatar */}
          {session.photoURL ? (
            <img src={session.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(34,197,94,0.5)", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#1a1a1a", border: "2px solid rgba(34,197,94,0.5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 800, color: "#f2f2f2" }}>{initial}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f2f2f2", truncate: "true" }}>{session.displayName}</span>
              {session.active ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", padding: "2px 8px", borderRadius: 12 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "onAirPulse 1.4s ease-in-out infinite" }} />
                  LIVE
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#666", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 12 }}>RUN ENDED</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>Sharing live run · Felcin</div>
          </div>
          <img src="/static/logo-full.svg" alt="Felcin" style={{ width: 28, height: 28, opacity: 0.6, flexShrink: 0 }} />
        </div>
      </div>

      {/* Bottom stats bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        padding: "16px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {[
            { label: "KM", value: (session.distance / 1000).toFixed(2) },
            { label: "TIME", value: formatTime(elapsed) },
            { label: "MIN/KM", value: formatPace(elapsed, session.distance) },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: "#555", fontWeight: 700, letterSpacing: "0.12em", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href="https://felcin.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#333", textDecoration: "none", fontWeight: 600 }}>
            Track your own runs on <span style={{ color: "#22c55e" }}>Felcin</span>
          </a>
        </div>
      </div>
    </div>
  );
}
