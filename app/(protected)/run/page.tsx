"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import FelcinLogo from "@/components/FelcinLogo";
import { useAuth } from "@/lib/auth";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, doc, setDoc, updateDoc } from "@/lib/db";
import { snapToRoads } from "@/lib/mapMatch";
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
  coordinates?: { lat: number; lng: number }[];
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
  const isAdmin = !!(user && OWNER_UIDS.includes(user.uid));

  // Location
  const [locState, setLocState] = useState<LocState>("prompt");
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const idleWatchRef = useRef<any>(null);
  const [waitSecs, setWaitSecs] = useState(0);
  const enablingRef = useRef(false); // prevent double-tap

  useEffect(() => {
    if (locState !== "waiting") { setWaitSecs(0); return; }
    const id = setInterval(() => setWaitSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [locState]);

  // On mount: check if permission is already granted/denied and act immediately
  useEffect(() => {
    (async () => {
      if (isNative) {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const status = await Geolocation.checkPermissions();
          if (status.location === "granted") enableLocation();
          else if (status.location === "denied") setLocState("denied");
          // "prompt" = not yet asked, show the Enable button
        } catch { /* plugin unavailable, show Enable button */ }
      } else {
        navigator.permissions?.query({ name: "geolocation" as PermissionName }).then(r => {
          if (r.state === "granted") enableLocation();
          if (r.state === "denied") setLocState("denied");
        }).catch(() => {});
      }
    })();
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
  const savingRef = useRef(false);
  const [expandedRun, setExpandedRun] = useState<RunRoute | null>(null);
  const [matchedCoords, setMatchedCoords] = useState<{ lat: number; lng: number }[] | null>(null);
  const [detailMatchedCoords, setDetailMatchedCoords] = useState<{ lat: number; lng: number }[] | null>(null);

  // Live sharing
  const [isSharing, setIsSharing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const liveSessionRef = useRef<string | null>(null);
  const lastShareWriteRef = useRef<number>(0);

  // ── Location: uses @capacitor/geolocation on native, navigator on web ────

  const isNative = Capacitor.isNativePlatform();

  const enableLocation = async () => {
    if (enablingRef.current) return;
    enablingRef.current = true;
    setLocState("waiting");
    try {
      if (isNative) {
        const { Geolocation } = await import("@capacitor/geolocation");
        // Request permission — iOS shows "Allow While Using App" dialog here.
        // This awaits the user's response; no timeout needed.
        const perm = await Geolocation.requestPermissions();
        if (perm.location === "denied") { setLocState("denied"); enablingRef.current = false; return; }

        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 });
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState("granted");

        if (idleWatchRef.current === null) {
          idleWatchRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: false },
            (p, err) => { if (!err && p) setCurrentPos({ lat: p.coords.latitude, lng: p.coords.longitude }); }
          );
        }
      } else {
        // Web: navigator.geolocation is callback-based, no first-class await
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLocState("granted");
            if (idleWatchRef.current === null) {
              idleWatchRef.current = navigator.geolocation.watchPosition(
                (p) => setCurrentPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
                () => {},
                { enableHighAccuracy: false, maximumAge: 5000, timeout: 30000 }
              );
            }
            enablingRef.current = false;
          },
          (err) => { setLocState(err.code === 1 ? "denied" : "prompt"); enablingRef.current = false; },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
        );
        return; // web path resolves via callbacks
      }
    } catch (e) {
      console.error("Location error:", e);
      setLocState("denied");
    }
    enablingRef.current = false;
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

    // accuracy = GPS error radius in metres. Skip noisy readings for the route
    // but still update the map dot (currentPos) so the pin doesn't freeze.
    const onPos = (lat: number, lng: number, accuracy?: number) => {
      // Always move the map dot, even on imprecise readings
      if (accuracy === undefined || accuracy <= 50) {
        setCurrentPos({ lat, lng });
      }

      // Only add to the route if the fix is good (≤30 m accuracy, ≥8 m moved)
      if (accuracy !== undefined && accuracy > 30) return;

      setCoords((prev) => {
        if (prev.length === 0) return [{ lat, lng, ts: Date.now() }];
        const last = prev[prev.length - 1];
        const d = haversineDist(last.lat, last.lng, lat, lng);
        if (d < 8) return prev;          // raised from 4 → 8 m to cut GPS jitter
        if (d > 100) return prev;        // >100 m jump in one tick = bad reading, skip
        distRef.current += d;
        setDistance(distRef.current);
        writeLivePosition(lat, lng, distRef.current, Math.floor((Date.now() - startTime - pausedMsRef.current) / 1000));
        return [...prev, { lat, lng, ts: Date.now() }];
      });
    };

    (async () => {
      if (isNative) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (pos, err) => {
            if (!err && pos) onPos(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? undefined);
          }
        );
        runWatchRef.current = id as any;
      } else {
        runWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => onPos(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
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

  // Road-snap when run ends
  useEffect(() => {
    if (phase !== "completed" || coords.length < 2) { setMatchedCoords(null); return; }
    snapToRoads(coords.map(c => ({ lat: c.lat, lng: c.lng }))).then(m => { if (m) setMatchedCoords(m); }).catch(() => {});
  }, [phase]); // eslint-disable-line

  // Road-snap when a historical run detail opens
  useEffect(() => {
    setDetailMatchedCoords(null);
    if (!expandedRun?.coordinates?.length) return;
    snapToRoads(expandedRun.coordinates).then(m => { if (m) setDetailMatchedCoords(m); }).catch(() => {});
  }, [expandedRun?.id]); // eslint-disable-line

  // ── Actions ──────────────────────────────────────────────────────────────

  // ── Live sharing ──────────────────────────────────────────────────────────

  const startSharing = async () => {
    if (!user || liveSessionRef.current) return;
    try {
      const ref = doc(collection(db, "runLiveSessions"));
      await setDoc(ref, {
        uid: user.uid,
        displayName: user.displayName || "Runner",
        photoURL: user.photoURL || null,
        lat: currentPos?.lat ?? 0,
        lng: currentPos?.lng ?? 0,
        distance,
        elapsed,
        active: true,
        startedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      liveSessionRef.current = ref.id;
      setShareId(ref.id);
      setIsSharing(true);

      const url = `https://www.felcin.com/run/live/${ref.id}`;
      if (navigator.share) {
        await navigator.share({ title: `${user.displayName || "Someone"} is running live on Felcin!`, text: "Follow my run in real time 🏃", url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch (e) { console.error("share:", e); }
  };

  const shareAgain = async () => {
    if (!shareId) return;
    const url = `https://www.felcin.com/run/live/${shareId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Follow my live run on Felcin!", text: "Track me in real time 🏃", url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch { /* dismissed */ }
  };

  const stopSharing = async () => {
    if (!liveSessionRef.current) return;
    try { await updateDoc(doc(db, "runLiveSessions", liveSessionRef.current), { active: false }); } catch { }
    liveSessionRef.current = null;
    setIsSharing(false);
    setShareId(null);
  };

  // Write live position to Firestore max every 8 seconds
  const writeLivePosition = async (lat: number, lng: number, dist: number, el: number) => {
    if (!liveSessionRef.current) return;
    const now = Date.now();
    if (now - lastShareWriteRef.current < 8000) return;
    lastShareWriteRef.current = now;
    try {
      await updateDoc(doc(db, "runLiveSessions", liveSessionRef.current), {
        lat, lng, distance: dist, elapsed: el, lastUpdated: serverTimestamp(),
      });
    } catch { }
  };

  const startCountdown = () => { setLastSaved(null); setCountdown(3); setPhase("countdown"); };
  const pauseRun = () => { pauseStartRef.current = Date.now(); setPhase("paused"); };
  const resumeRun = () => { pausedMsRef.current += Date.now() - pauseStartRef.current; setPhase("running"); };
  const stopRun = async () => {
    await stopSharing();
    setPhase("completed");
  };
  const discardRun = () => { setCoords([]); setDistance(0); setElapsed(0); setPhase("idle"); };

  const saveRun = async () => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
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
    savingRef.current = false;
    setPhase("idle");
  };

  // Coming soon — block all non-admin users until run tracker is fully ready
  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 80px)", textAlign: "center" }}>
        <style>{`@keyframes onAirPulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <div style={{ background: "rgba(0,18,8,0.85)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 28, padding: "40px 32px", maxWidth: 340, width: "100%", boxShadow: "0 0 60px rgba(34,197,94,0.07), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 28 }}>
            <FelcinLogo size={62} />
            <div style={{ width: 1, height: 46, background: "rgba(34,197,94,0.28)" }} />
            <div style={{ width: 62, height: 62, borderRadius: 18, background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 38, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>directions_run</span>
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#22c55e", letterSpacing: "0.18em", marginBottom: 10 }}>FELCIN</div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#f2f2f2", letterSpacing: "-0.5px", margin: "0 0 18px" }}>Run Tracker</h2>
          {/* Heartbeat line */}
          <svg viewBox="0 0 220 44" style={{ width: "80%", maxWidth: 220, marginBottom: 22, overflow: "visible" }}>
            <path d="M0,22 L72,22 L80,22 L86,7 L96,38 L104,12 L110,22 L220,22" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.65"/>
          </svg>
          <p style={{ fontSize: 13, color: "#4a4a4a", lineHeight: 1.75, marginBottom: 28, maxWidth: 260, margin: "0 auto 28px" }}>
            Live GPS route tracking, real-time maps, personal records, and pace analytics — launching soon.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 22px", borderRadius: 22, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "onAirPulse 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", letterSpacing: "0.12em" }}>COMING SOON</span>
          </div>
        </div>
      </div>
    );
  }

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

        {/* Blocked or web-timeout → settings screen. On native, requestPermissions() awaits the dialog
            so waitSecs never controls the UI; only show settings on native when explicitly denied. */}
        {(locState === "denied" || (locState === "waiting" && !isNative && waitSecs >= 30)) && (
          <>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: "#f2f2f2", marginBottom: 8 }}>Allow Location Access</h2>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 290, marginBottom: 24 }}>
              Felcin needs location to track your run. Enable it in 3 taps:
            </p>

            <div style={{ width: "100%", maxWidth: 320, background: "#131313", borderRadius: 18, padding: "18px 18px", marginBottom: 24, textAlign: "left", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { n: 1, text: "Open iPhone Settings" },
                { n: 2, text: 'Scroll down and tap "Felcin"' },
                { n: 3, text: 'Tap Location → select "While Using"' },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: n < 3 ? 14 : 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#22c55e", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{n}</div>
                  <p style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

            {/* Deep-link to app settings on native, fallback reload on web */}
            <button
              onClick={() => {
                if (isNative) {
                  window.open("app-settings:", "_system");
                } else {
                  window.location.reload();
                }
              }}
              style={{ width: "100%", maxWidth: 320, padding: "16px 0", borderRadius: 16, border: "none", background: "#22c55e", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.25)", marginBottom: 12 }}>
              {isNative ? "Open Felcin Settings" : "Done — Reload Page"}
            </button>
            {isNative && (
              <button onClick={() => { enablingRef.current = false; enableLocation(); }} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "8px 0" }}>
                I've enabled it — try again
              </button>
            )}
          </>
        )}

        {/* Waiting — native: always show (requestPermissions awaits dialog + GPS fix); web: show until 30s */}
        {locState === "waiting" && (isNative || waitSecs < 30) && (
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
          completed={phase === "completed"}
          matchedCoords={matchedCoords ?? undefined}
          fullscreen={phase !== "idle"}
        />
        {phase === "idle" && (
          <>
            <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 14px)", left: 16, zIndex: 2, pointerEvents: "none", opacity: 0.85 }}>
              <FelcinLogo size={36} />
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, transparent, #090909)", pointerEvents: "none" }} />
          </>
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
            {/* Share button */}
          <button
            onClick={isSharing ? shareAgain : startSharing}
            style={{
              width: 58, height: 58, borderRadius: "50%",
              background: isSharing ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
              border: isSharing ? "1.5px solid rgba(34,197,94,0.5)" : "1.5px solid rgba(255,255,255,0.15)",
              color: isSharing ? "#22c55e" : "#888",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "pointer", gap: 2,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
              {shareCopied ? "check" : "share"}
            </span>
            {shareCopied && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e" }}>COPIED</span>}
          </button>
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

      {/* RUN DETAIL OVERLAY */}
      {expandedRun && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#090909", display: "flex", flexDirection: "column" }}>
          {/* Map */}
          <div style={{ position: "relative", flexShrink: 0, height: "52dvh" }}>
            {(expandedRun.coordinates?.length ?? 0) > 0 ? (
              <RunMap
                coords={expandedRun.coordinates!.map(c => ({ lat: c.lat, lng: c.lng }))}
                currentPos={{ lat: expandedRun.coordinates![expandedRun.coordinates!.length - 1].lat, lng: expandedRun.coordinates![expandedRun.coordinates!.length - 1].lng }}
                followUser={false}
                fullscreen={false}
                completed={true}
                matchedCoords={detailMatchedCoords ?? undefined}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: 13, color: "#333" }}>No route data</p>
              </div>
            )}
            {/* Back button */}
            <button
              onClick={() => setExpandedRun(null)}
              style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 14px)", left: 16, zIndex: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(8px)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
            </button>
          </div>

          {/* Stats */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
            {/* Name + date + badges */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#f2f2f2", letterSpacing: "-0.4px" }}>{expandedRun.name || "Run"}</span>
                {expandedRun.isDistancePR && <span style={{ fontSize: 10, fontWeight: 900, color: "#000", background: "#fbbf24", padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>DIST PR</span>}
                {expandedRun.isPacePR && <span style={{ fontSize: 10, fontWeight: 900, color: "#000", background: "#a78bfa", padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>PACE PR</span>}
              </div>
              <p style={{ fontSize: 13, color: "#555" }}>{formatDate(expandedRun.date)}</p>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {[
                { label: "KM", value: (expandedRun.distance / 1000).toFixed(2) },
                { label: "TIME", value: formatTime(expandedRun.duration) },
                { label: "PACE", value: `${formatPace(expandedRun.avgPace)}/km` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#131313", borderRadius: 14, padding: "14px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#f2f2f2", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "#444", fontWeight: 700, letterSpacing: "0.1em", marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* GPS points */}
            {(expandedRun.coordinates?.length ?? 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "#131313", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#333" }}>route</span>
                <span style={{ fontSize: 12, color: "#444" }}>{expandedRun.coordinates!.length} GPS points recorded</span>
              </div>
            )}
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
                {runs.map(run => <RunCard key={run.id} run={run} onTap={() => setExpandedRun(run)} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunCard({ run, onTap }: { run: RunRoute; onTap?: () => void }) {
  const hasPR = run.isDistancePR || run.isPacePR;
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtP = (s: number) => (!s || !isFinite(s) || s <= 0) ? "--:--" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div onClick={onTap} style={{ background: "#131313", borderRadius: 16, padding: "14px 16px", border: hasPR ? "1px solid rgba(251,191,36,0.18)" : "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 14, cursor: onTap ? "pointer" : "default", WebkitTapHighlightColor: "transparent" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>directions_run</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f2" }}>{run.name || "Run"}</span>
          {run.isDistancePR && <span style={{ fontSize: 9, fontWeight: 900, color: "#000", background: "#fbbf24", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>DIST PR</span>}
          {run.isPacePR && <span style={{ fontSize: 9, fontWeight: 900, color: "#000", background: "#a78bfa", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>PACE PR</span>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>{(run.distance / 1000).toFixed(2)} km · {fmtT(run.duration)} · {fmtP(run.avgPace)}/km</div>
      </div>
      <div style={{ fontSize: 11, color: "#333", flexShrink: 0 }}>{formatDate(run.date)}</div>
    </div>
  );
}
