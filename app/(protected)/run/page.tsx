"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import FelcinLogo from "@/components/FelcinLogo";
import { useAuth } from "@/lib/auth";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, limit, serverTimestamp, doc, setDoc, updateDoc } from "@/lib/db";
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
type ActivityMode = "run" | "cycle";
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
  const [needsAlwaysLocation, setNeedsAlwaysLocation] = useState(false);
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
          if (status.location === "granted") {
            enableLocation();
            // Check if user only has "When In Use" — background tracking needs "Always"
            // Capacitor doesn't expose always vs whenInUse directly, so we use a native bridge
            // check via the window.Capacitor.Plugins path if available
            checkAlwaysPermission();
          } else if (status.location === "denied") setLocState("denied");
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

  // Check if the user has "Always" location — required for GPS to continue when screen locks
  const checkAlwaysPermission = async () => {
    try {
      // Try native bridge: CLAuthorizationStatus 3 = authorizedAlways, 4 = authorizedWhenInUse
      const cap = (window as any).Capacitor;
      if (!cap?.Plugins?.CapacitorGeolocation) {
        // Fallback: assume not always if we can't check
        // We'll show the banner; user can dismiss if they already have Always
        setNeedsAlwaysLocation(true);
        return;
      }
      const result = await cap.Plugins.CapacitorGeolocation.checkPermissions();
      // If the plugin returns a specific always status we can check it
      const isAlways = result?.location === "granted" && result?.always === true;
      if (!isAlways) setNeedsAlwaysLocation(true);
    } catch {
      setNeedsAlwaysLocation(true);
    }
  };

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

  // Activity mode + units
  const [mode, setMode] = useState<ActivityMode>("run");
  const [useMiles, setUseMiles] = useState(false);

  // History
  const [runs, setRuns] = useState<RunRoute[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [rides, setRides] = useState<RunRoute[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [lastSaved, setLastSaved] = useState<{ isDistancePR: boolean; isPacePR: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
        checkAlwaysPermission();

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
        const q = query(collection(db, "users", user.uid, "runningRoutes"), limit(30));
        const docs = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() } as RunRoute));
        // Sort client-side so mixed/legacy date types don't break orderBy
        docs.sort((a, b) => {
          const ta = a.date?.toMillis?.() ?? (a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime() || 0);
          const tb = b.date?.toMillis?.() ?? (b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime() || 0);
          return tb - ta;
        });
        setRuns(docs);
      } catch (e) { console.error("loadRuns failed:", e); } finally { setLoadingRuns(false); }
    })();
    (async () => {
      try {
        const q = query(collection(db, "users", user.uid, "cyclingRoutes"), limit(30));
        const docs = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() } as RunRoute));
        docs.sort((a, b) => {
          const ta = a.date?.toMillis?.() ?? (a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime() || 0);
          const tb = b.date?.toMillis?.() ?? (b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime() || 0);
          return tb - ta;
        });
        setRides(docs);
      } catch (e) { console.error("loadRides failed:", e); } finally { setLoadingRides(false); }
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
    setIsSaving(true);
    setSaveError(null);
    const isCycle = mode === "cycle";
    const duration = elapsed;
    const avgPace = distance > 0 ? duration / (distance / 1000) : 0;
    const history = isCycle ? rides : runs;
    const maxDist = history.reduce((m, r) => Math.max(m, r.distance || 0), 0);
    const bestPace = history.filter(r => r.avgPace > 0 && r.distance >= 500).reduce((m, r) => Math.min(m, r.avgPace), Infinity);
    const isDistancePR = distance > 100 && distance > maxDist;
    const isPacePR = distance >= 500 && avgPace > 0 && avgPace < bestPace;
    let stored = coords;
    if (coords.length > 1000) { const step = Math.ceil(coords.length / 1000); stored = coords.filter((_, i) => i % step === 0); }
    const day = new Date().toLocaleDateString("en-US", { weekday: "short" });
    const name = isCycle ? `${day} Ride` : `${day} Run`;
    const col = isCycle ? "cyclingRoutes" : "runningRoutes";
    try {
      const ref = await addDoc(collection(db, "users", user.uid, col), {
        coordinates: stored, distance, duration, avgPace, date: serverTimestamp(), isDistancePR, isPacePR, name,
      });
      const entry = { id: ref.id, name, distance, duration, avgPace, date: new Date(), isDistancePR, isPacePR };
      if (isCycle) setRides(prev => [entry, ...prev]); else setRuns(prev => [entry, ...prev]);
      setLastSaved({ isDistancePR, isPacePR });
      setPhase("idle");
    } catch (e: unknown) {
      const msg = (e instanceof Error) ? e.message : String(e);
      console.error("saveRun failed:", msg);
      setSaveError(msg || "Unknown error");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };


  const avgPace = distance > 0 ? elapsed / (distance / 1000) : 0;
  const speedKmh = elapsed > 0 ? (distance / elapsed) * 3.6 : 0;
  const isTracking = phase === "running" || phase === "paused";
  const isCycle = mode === "cycle";
  const ACCENT = isCycle ? "#f97316" : "#22c55e";
  const ACCENT_GLOW = isCycle ? "rgba(249,115,22,0.28)" : "rgba(34,197,94,0.28)";
  const ACTIVITY_ICON = isCycle ? "directions_bike" : "directions_run";
  const ACTIVITY_LABEL = isCycle ? "Ride" : "Run";

  // Unit helpers
  const KM_TO_MI = 0.621371;
  const distDisplay = useMiles ? (distance / 1000 * KM_TO_MI).toFixed(2) : (distance / 1000).toFixed(2);
  const distUnit = useMiles ? "MI" : "KM";
  const paceDisplay = isCycle
    ? (useMiles ? (speedKmh * KM_TO_MI).toFixed(1) : speedKmh.toFixed(1))
    : formatPace(useMiles ? avgPace * KM_TO_MI : avgPace);
  const paceUnit = isCycle ? (useMiles ? "MPH" : "KM/H") : (useMiles ? "MIN/MI" : "MIN/KM");

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
              {[{ label: distUnit, value: distDisplay }, { label: "TIME", value: formatTime(elapsed) }, { label: paceUnit, value: paceDisplay }].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", letterSpacing: "-1px", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.13em", marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
            {/* Unit toggle */}
            <button onClick={() => setUseMiles(m => !m)} style={{ display: "block", margin: "12px auto 0", padding: "4px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#888", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}>
              {useMiles ? "KM" : "MI"}
            </button>
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
            <button onClick={phase === "running" ? pauseRun : resumeRun} style={{ width: 78, height: 78, borderRadius: "50%", background: ACCENT, border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 0 32px ${ACCENT_GLOW.replace("0.28","0.45")}` }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 6, color: isCycle ? "#fb923c" : "#4ade80" }}>{isCycle ? "RIDE COMPLETE" : "RUN COMPLETE"}</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#f2f2f2", letterSpacing: "-1.5px", lineHeight: 1 }}>
                {distDisplay}<span style={{ fontSize: 18, fontWeight: 600, color: "#555", marginLeft: 6 }}>{useMiles ? "mi" : "km"}</span>
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
            {saveError && (
              <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#ef4444", flexShrink: 0 }}>error</span>
                  <span style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>Could not save your run</span>
                </div>
                <span style={{ fontSize: 11, color: "#7f3a3a", paddingLeft: 24, wordBreak: "break-all" }}>{saveError}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={discardRun} disabled={isSaving} style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "#555", fontSize: 14, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}>Discard</button>
              <button onClick={saveRun} disabled={isSaving} style={{ flex: 2, padding: "14px 0", borderRadius: 14, border: "none", background: isSaving ? "#1a3d27" : ACCENT, color: isSaving ? "#555" : "#fff", fontSize: 15, fontWeight: 800, cursor: isSaving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                {isSaving ? "Saving…" : saveError !== null ? `Retry Save` : `Save ${ACTIVITY_LABEL}`}
              </button>
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

          {/* Background location upgrade prompt */}
          {isNative && needsAlwaysLocation && (
            <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f59e0b", fontVariationSettings: "'FILL' 1", flexShrink: 0, marginTop: 1 }}>location_on</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f2", marginBottom: 2 }}>Enable background tracking</div>
                <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>Set location to <strong style={{ color: "#f59e0b" }}>Always</strong> so your run keeps recording when the screen locks.</div>
                <button
                  onClick={() => { (window as any).open?.("app-settings:", "_system"); }}
                  style={{ marginTop: 8, padding: "5px 14px", borderRadius: 20, border: "none", background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Open Settings
                </button>
              </div>
              <button onClick={() => setNeedsAlwaysLocation(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          )}

          {lastSaved && (lastSaved.isDistancePR || lastSaved.isPacePR) && (
            <div style={{ marginBottom: 14, padding: "14px 16px", borderRadius: 16, background: "linear-gradient(135deg,rgba(251,191,36,0.08),rgba(245,158,11,0.04))", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#fbbf24", fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>emoji_events</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f2f2f2" }}>New Personal Record!</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{[lastSaved.isDistancePR && `Longest ${ACTIVITY_LABEL.toLowerCase()}`, lastSaved.isPacePR && (isCycle ? "Best speed" : "Best pace")].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div style={{ display: "flex", background: "#131313", borderRadius: 16, padding: 4, gap: 4, marginBottom: 14, border: "1px solid rgba(255,255,255,0.05)" }}>
            {(["run", "cycle"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer",
                background: mode === m ? (m === "run" ? "#22c55e" : "#f97316") : "transparent",
                color: mode === m ? "#fff" : "#555",
                fontSize: 13, fontWeight: 700, transition: "all 0.18s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>
                  {m === "run" ? "directions_run" : "directions_bike"}
                </span>
                {m === "run" ? "Running" : "Cycling Track"}
              </button>
            ))}
          </div>

          <button onClick={startCountdown} style={{ width: "100%", padding: "17px 0", borderRadius: 18, border: "none", background: ACCENT, color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: `0 4px 24px ${ACCENT_GLOW}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>{ACTIVITY_ICON}</span>
            Start {ACTIVITY_LABEL}
          </button>

          <div style={{ marginTop: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", marginBottom: 12 }}>{isCycle ? "RIDE HISTORY" : "RUN HISTORY"}</p>
            {isCycle ? (
              loadingRides ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ height: 68, borderRadius: 16, background: "#131313" }} />)}
                </div>
              ) : rides.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", color: "#1e1e1e", marginBottom: 10 }}>directions_bike</span>
                  <p style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>No rides yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {rides.map(ride => <RunCard key={ride.id} run={ride} mode="cycle" onTap={() => setExpandedRun(ride)} />)}
                </div>
              )
            ) : (
              loadingRuns ? (
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
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunCard({ run, mode = "run", onTap }: { run: RunRoute; mode?: ActivityMode; onTap?: () => void }) {
  const hasPR = run.isDistancePR || run.isPacePR;
  const isCycle = mode === "cycle";
  const accent = isCycle ? "#f97316" : "#22c55e";
  const accentBg = isCycle ? "rgba(249,115,22,0.1)" : "rgba(34,197,94,0.1)";
  const icon = isCycle ? "directions_bike" : "directions_run";
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtP = (s: number) => (!s || !isFinite(s) || s <= 0) ? "--:--" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const speedStr = run.duration > 0 ? `${((run.distance / run.duration) * 3.6).toFixed(1)} km/h` : "--";
  const thirdStat = isCycle ? speedStr : `${fmtP(run.avgPace)}/km`;
  return (
    <div onClick={onTap} style={{ background: "#131313", borderRadius: 16, padding: "14px 16px", border: hasPR ? "1px solid rgba(251,191,36,0.18)" : "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 14, cursor: onTap ? "pointer" : "default", WebkitTapHighlightColor: "transparent" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: accentBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: accent, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f2" }}>{run.name || (isCycle ? "Ride" : "Run")}</span>
          {run.isDistancePR && <span style={{ fontSize: 9, fontWeight: 900, color: "#000", background: "#fbbf24", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>DIST PR</span>}
          {run.isPacePR && <span style={{ fontSize: 9, fontWeight: 900, color: "#000", background: "#a78bfa", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>{isCycle ? "SPEED PR" : "PACE PR"}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>{(run.distance / 1000).toFixed(2)} km · {fmtT(run.duration)} · {thirdStat}</div>
      </div>
      <div style={{ fontSize: 11, color: "#333", flexShrink: 0 }}>{formatDate(run.date)}</div>
    </div>
  );
}
