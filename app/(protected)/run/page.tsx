"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

const RunMap = dynamic(() => import("@/components/RunMap"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%", background: "#0a0a0a" }} />,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Coord { lat: number; lng: number; ts: number }
interface RunRoute {
  id: string; name: string; distance: number; duration: number;
  avgPace: number; date: any; isDistancePR: boolean; isPacePR: boolean;
}
type Phase = "idle" | "countdown" | "running" | "paused" | "completed";
type LocState = "prompt" | "waiting" | "granted" | "denied";

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, r = (d: number) => d * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}` : `${m}:${String(ss).padStart(2,"0")}`;
}
function formatPace(s: number) {
  if (!s || !isFinite(s) || s <= 0) return "--:--";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function formatDate(raw: any) {
  try {
    const d = raw?.toDate ? raw.toDate() : new Date(raw);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yday = new Date(today); yday.setDate(today.getDate() - 1);
    if (d.toDateString() === yday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunPage() {
  const { user } = useAuth();

  // Location
  const [locState, setLocState] = useState<LocState>("prompt");
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const idleWatchRef = useRef<number | null>(null);
  const [waitSecs, setWaitSecs] = useState(0);

  useEffect(() => {
    if (locState !== "waiting") { setWaitSecs(0); return; }
    const id = setInterval(() => setWaitSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [locState]);

  // On mount: if permission is already granted, skip the gate entirely
  useEffect(() => {
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then(r => {
      if (r.state === "granted") enableLocation();
      if (r.state === "denied") setLocState("denied");
    }).catch(() => {});
  }, []);

  // Phase
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);

  // Run recording
  const [coords, setCoords] = useState<Coord[]>([]);
  const distRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);
  const runWatchRef = useRef<number | null>(null);

  // History
  const [runs, setRuns] = useState<RunRoute[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [lastSaved, setLastSaved] = useState<{ isDistancePR: boolean; isPacePR: boolean } | null>(null);

  // ── Location: uses @capacitor/geolocation on native, navigator on web ────

  const isNative = Capacitor.isNativePlatform();

  const enableLocation = async () => {
    setLocState("waiting");
    try {
      if (isNative) {
        // Native: request permission via Capacitor (shows proper iOS "While Using" dialog)
        const { Geolocation } = await import("@capacitor/geolocation");
        const perm = await Geolocation.requestPermissions();
        if (perm.location === "denied") { setLocState("denied"); return; }

        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState("granted");

        // Start live watch via Capacitor
        if (idleWatchRef.current === null) {
          const watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: false },
            (pos, err) => {
              if (err || !pos) return;
              setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          );
          (idleWatchRef as any).current = watchId;
        }
      } else {
        // Web: use navigator.geolocation
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLocState("granted");
            if (idleWatchRef.current === null) {
              idleWatchRef.current = navigator.geolocation.watchPosition(
                (p) => setCurrentPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
                () => {},
                { enableHighAccuracy: false, maximumAge: 5000, timeout: 30000 }
              ) as any;
            }
          },
          (err) => setLocState(err.code === 1 ? "denied" : "prompt"),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 10000 }
        );
      }
    } catch {
      setLocState("prompt");
    }
  };

  // Clean up watches on unmount
  useEffect(() => () => {
    (async () => {
      if (idleWatchRef.current !== null) {
        if (isNative) {
          const { Geolocation } = await import("@capacitor/geolocation");
          await Geolocation.clearWatch({ id: idleWatchRef.current as any });
        } else {
          navigator.geolocation.clearWatch(idleWatchRef.current as any);
        }
      }
      if (runWatchRef.current !== null) {
        if (isNative) {
          const { Geolocation } = await import("@capacitor/geolocation");
          await Geolocation.clearWatch({ id: runWatchRef.current as any });
        } else {
          navigator.geolocation.clearWatch(runWatchRef.current as any);
        }
      }
    })();
  }, []);

  // ── High-accuracy run recording watch ────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") {
      if (runWatchRef.current !== null) {
        (async () => {
          if (isNative) {
            const { Geolocation } = await import("@capacitor/geolocation");
            await Geolocation.clearWatch({ id: runWatchRef.current as any });
          } else {
            navigator.geolocation.clearWatch(runWatchRef.current as any);
          }
          runWatchRef.current = null;
        })();
      }
      return;
    }

    const onPos = (lat: number, lng: number) => {
      setCurrentPos({ lat, lng });
      setCoords((prev) => {
        if (prev.length === 0) return [{ lat, lng, ts: Date.now() }];
        const last = prev[prev.length - 1];
        const d = haversineDist(last.lat, last.lng, lat, lng);
        if (d < 4) return prev;
        distRef.current += d;
        setDistance(distRef.current);
        return [...prev, { lat, lng, ts: Date.now() }];
      });
    };

    (async () => {
      if (isNative) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (pos, err) => { if (!err && pos) onPos(pos.coords.latitude, pos.coords.longitude); }
        );
        runWatchRef.current = id as any;
      } else {
        runWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => onPos(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        ) as any;
      }
    })();

    return () => {
      if (runWatchRef.current !== null) {
        (async () => {
          if (isNative) {
            const { Geolocation } = await import("@capacitor/geolocation");
            await Geolocation.clearWatch({ id: runWatchRef.current as any });
          } else {
            navigator.geolocation.clearWatch(runWatchRef.current as any);
          }
          runWatchRef.current = null;
        })();
      }
    };
  }, [phase]);

  // ── Load history ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const q = query(collection(db, "users", user.uid, "runningRoutes"), orderBy("date", "desc"), limit(30));
        setRuns((await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() } as RunRoute)));
      } catch { } finally { setLoadingRuns(false); }
    })();
  }, [user]);

  // ── Countdown ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      distRef.current = 0; pausedMsRef.current = 0; pauseStartRef.current = 0;
      setDistance(0); setCoords([]); setElapsed(0);
      setStartTime(Date.now()); setPhase("running");
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime - pausedMsRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase, startTime]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const startCountdown = () => { setLastSaved(null); setCountdown(3); setPhase("countdown"); };
  const pauseRun = () => { pauseStartRef.current = Date.now(); setPhase("paused"); };
  const resumeRun = () => { pausedMsRef.current += Date.now() - pauseStartRef.current; setPhase("running"); };
  const stopRun = () => setPhase("completed");
  const discardRun = () => { setCoords([]); setDistance(0); setElapsed(0); setPhase("idle"); };

  const saveRun = async () => {
    if (!user) return;
    const duration = elapsed, avgPace = distance > 0 ? duration / (distance / 1000) : 0;
    const maxDist = runs.reduce((m, r) => Math.max(m, r.distance || 0), 0);
    const bestPace = runs.filter(r => r.avgPace > 0 && r.distance >= 1000).reduce((m, r) => Math.min(m, r.avgPace), Infinity);
    const isDistancePR = distance > 100 && distance > maxDist;
    const isPacePR = distance >= 1000 && avgPace > 0 && avgPace < bestPace;
    let stored = coords;
    if (coords.length > 1000) { const step = Math.ceil(coords.length / 1000); stored = coords.filter((_, i) => i % step === 0); }
    const name = `${new Date().toLocaleDateString("en-US", { weekday: "short" })} Run`;
    try {
      const ref = await addDoc(collection(db, "users", user.uid, "runningRoutes"), {
        coordinates: stored, distance, duration, avgPace, date: serverTimestamp(), isDistancePR, isPacePR, name,
      });
      setRuns(prev => [{ id: ref.id, name, distance, duration, avgPace, date: new Date(), isDistancePR, isPacePR }, ...prev]);
      setLastSaved({ isDistancePR, isPacePR });
    } catch (e) { console.error(e); }
    setPhase("idle");
  };

  const avgPace = distance > 0 ? elapsed / (distance / 1000) : 0;
  const isTracking = phase === "running" || phase === "paused";

  // ── Permission screen ─────────────────────────────────────────────────────

  if (locState !== "granted") {
    return (
      <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 80px)", textAlign: "center" }}>
        <style>{`@keyframes locPulse{0%,100%{opacity:1}50%{opacity:0.35}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <div style={{ width: 88, height: 88, borderRadius: 24, marginBottom: 28, background: locState === "denied" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.1)", border: `1px solid ${locState === "denied" ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 44, color: locState === "denied" ? "#ef4444" : "#22c55e", fontVariationSettings: "'FILL' 1", animation: locState === "waiting" ? "locPulse 1.5s ease-in-out infinite" : "none" }}>
            {locState === "denied" ? "location_off" : "location_on"}
          </span>
        </div>

        {/* Blocked or no-popup-after-5s → same fix screen */}
        {(locState === "denied" || (locState === "waiting" && waitSecs >= 5)) && (
          <>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: "#f2f2f2", marginBottom: 8 }}>Enable Location in Settings</h2>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 290, marginBottom: 24 }}>
              Your browser has location blocked for this site. Fix it in 3 taps:
            </p>

            <div style={{ width: "100%", maxWidth: 320, background: "#131313", borderRadius: 18, padding: "18px 18px", marginBottom: 24, textAlign: "left", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { n: 1, text: "Open iPhone Settings" },
                { n: 2, text: "Privacy & Security → Location Services" },
                { n: 3, text: "Tap Safari (or Chrome) → set to While Using" },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: n < 3 ? 14 : 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#22c55e", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{n}</div>
                  <p style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

            <button onClick={() => window.location.reload()} style={{ width: "100%", maxWidth: 320, padding: "16px 0", borderRadius: 16, border: "none", background: "#22c55e", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.25)" }}>
              Done — Reload Page
            </button>
          </>
        )}

        {/* Waiting ≤ 5s */}
        {locState === "waiting" && waitSecs < 5 && (
          <>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: "#f2f2f2", marginBottom: 10 }}>Waiting for permission…</h2>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.65, maxWidth: 280 }}>
              A popup should appear — tap <strong style={{ color: "#fff" }}>Allow</strong>.
            </p>
          </>
        )}

        {/* Prompt — show button */}
        {locState === "prompt" && (
          <>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "#f2f2f2", marginBottom: 10, letterSpacing: "-0.5px" }}>Track Your Runs</h2>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 1.65, maxWidth: 290, marginBottom: 32 }}>
              Felcin uses your location to draw your route live, measure distance, and log PRs.
            </p>
            <button onClick={enableLocation} style={{ width: "100%", maxWidth: 320, padding: "17px 0", borderRadius: 18, border: "none", background: "#22c55e", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 24px rgba(34,197,94,0.3)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>my_location</span>
              Enable Location
            </button>
            <p style={{ fontSize: 11, color: "#2a2a2a", marginTop: 14 }}>Only used while the app is open</p>
          </>
        )}
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#090909", minHeight: "100dvh", position: "relative" }}>

      {/* MAP */}
      <div style={{ position: phase === "idle" ? "relative" : "fixed", inset: 0, height: phase === "idle" ? "52dvh" : "100dvh", zIndex: phase === "idle" ? 0 : 10 }}>
        <RunMap
          coords={coords.map(c => ({ lat: c.lat, lng: c.lng }))}
          currentPos={currentPos}
          followUser={phase === "idle" || phase === "running"}
          fullscreen={phase !== "idle"}
        />
        {phase === "idle" && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, transparent, #090909)", pointerEvents: "none" }} />
        )}
      </div>

      {/* COUNTDOWN */}
      {phase === "countdown" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 100, fontWeight: 900, lineHeight: 1, letterSpacing: "-4px", fontVariantNumeric: "tabular-nums", color: countdown === 0 ? "#4ade80" : "#fff" }}>
            {countdown === 0 ? "GO!" : countdown}
          </div>
          <p style={{ color: "#555", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em" }}>GET READY</p>
        </div>
      )}

      {/* TRACKING OVERLAY */}
      {isTracking && (
        <>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 20, padding: "calc(env(safe-area-inset-top,0px) + 20px) 24px 22px", background: "linear-gradient(to bottom,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.5) 75%,transparent 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[{ label: "KM", value: (distance / 1000).toFixed(2) }, { label: "TIME", value: formatTime(elapsed) }, { label: "MIN/KM", value: formatPace(avgPace) }].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", letterSpacing: "-1px", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.13em", marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
            {phase === "paused" && (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.14em", background: "rgba(245,158,11,0.12)", padding: "3px 14px", borderRadius: 20 }}>PAUSED</span>
              </div>
            )}
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20, padding: "20px 32px calc(env(safe-area-inset-bottom,0px) + 90px)", background: "linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 70%,transparent 100%)", display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
            <button onClick={stopRun} style={{ width: 58, height: 58, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1.5px solid rgba(239,68,68,0.4)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>stop</span>
            </button>
            <button onClick={phase === "running" ? pauseRun : resumeRun} style={{ width: 78, height: 78, borderRadius: "50%", background: "#22c55e", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 0 32px rgba(34,197,94,0.45)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}>{phase === "running" ? "pause" : "play_arrow"}</span>
            </button>
            <div style={{ width: 58, height: 58 }} />
          </div>
        </>
      )}

      {/* COMPLETED SHEET */}
      {phase === "completed" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ background: "#111", borderTop: "1px solid rgba(255,255,255,0.08)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "0 20px", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 88px)", maxHeight: "68dvh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 20px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
            </div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 6 }}>RUN COMPLETE</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#f2f2f2", letterSpacing: "-1.5px", lineHeight: 1 }}>
                {(distance / 1000).toFixed(2)}<span style={{ fontSize: 18, fontWeight: 600, color: "#555", marginLeft: 6 }}>km</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[{ label: "Time", value: formatTime(elapsed), icon: "timer" }, { label: "Avg Pace", value: `${formatPace(avgPace)}/km`, icon: "speed" }].map(({ label, value, icon }) => (
                <div key={label} style={{ background: "#1a1a1a", borderRadius: 16, padding: "16px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#333", fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#f2f2f2", lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 10, color: "#555", fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={discardRun} style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Discard</button>
              <button onClick={saveRun} style={{ flex: 2, padding: "14px 0", borderRadius: 14, border: "none", background: "#22c55e", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Save Run</button>
            </div>
          </div>
        </div>
      )}

      {/* IDLE CONTENT */}
      {phase === "idle" && (
        <div style={{ position: "relative", zIndex: 1, padding: "12px 16px 48px" }}>
          {lastSaved && (lastSaved.isDistancePR || lastSaved.isPacePR) && (
            <div style={{ marginBottom: 14, padding: "14px 16px", borderRadius: 16, background: "linear-gradient(135deg,rgba(251,191,36,0.08),rgba(245,158,11,0.04))", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#fbbf24", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>emoji_events</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f2f2f2" }}>New Personal Record!</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{[lastSaved.isDistancePR && "Longest run", lastSaved.isPacePR && "Best pace"].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          )}

          <button onClick={startCountdown} style={{ width: "100%", padding: "17px 0", borderRadius: 18, border: "none", background: "#22c55e", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 24px rgba(34,197,94,0.28)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>directions_run</span>
            Start Run
          </button>

          <div style={{ marginTop: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", marginBottom: 12 }}>RUN HISTORY</p>
            {loadingRuns ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ height: 68, borderRadius: 16, background: "#131313" }} />)}
              </div>
            ) : runs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", color: "#1e1e1e", marginBottom: 10 }}>route</span>
                <p style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>No runs yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {runs.map(run => <RunCard key={run.id} run={run} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunRoute }) {
  const hasPR = run.isDistancePR || run.isPacePR;
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtP = (s: number) => (!s || !isFinite(s) || s <= 0) ? "--:--" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div style={{ background: "#131313", borderRadius: 16, padding: "14px 16px", border: hasPR ? "1px solid rgba(251,191,36,0.18)" : "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>directions_run</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f2" }}>{run.name || "Run"}</span>
          {run.isDistancePR && <span style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(251,191,36,0.22)" }}>DIST PR</span>}
          {run.isPacePR && <span style={{ fontSize: 9, fontWeight: 800, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(167,139,250,0.22)" }}>PACE PR</span>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>{(run.distance / 1000).toFixed(2)} km · {fmtT(run.duration)} · {fmtP(run.avgPace)}/km</div>
      </div>
      <div style={{ fontSize: 11, color: "#333", flexShrink: 0 }}>{formatDate(run.date)}</div>
    </div>
  );
}
