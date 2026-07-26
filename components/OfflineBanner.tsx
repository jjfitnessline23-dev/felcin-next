"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import OutageScreen from "./OutageScreen";

type Status = "ok" | "offline" | "platform_down" | "reconnected";

export default function OfflineBanner() {
  const [status, setStatus] = useState<Status>("ok");
  const platformTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<Status>("ok");

  const set = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  useEffect(() => {
    // ── Device network events ──────────────────────────────────────────────
    const onOffline = () => {
      if (platformTimer.current) clearTimeout(platformTimer.current);
      set("offline");
    };
    const onOnline = () => {
      if (statusRef.current === "offline") {
        set("reconnected");
        setTimeout(() => { if (statusRef.current === "reconnected") set("ok"); }, 3000);
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) set("offline");

    // ── Firestore health monitor ───────────────────────────────────────────
    // Works on web only (db is null in Capacitor builds where native plugin handles Firestore).
    // We subscribe to a lightweight document with includeMetadataChanges.
    // fromCache: true for >6 s while device is online → platform is down.
    // fromCache: false → backend reachable, clear any platform_down state.
    let unsub: (() => void) | null = null;

    const IS_CAP = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

    if (!IS_CAP && db) {
      try {
        const { doc, onSnapshot } = require("firebase/firestore") as typeof import("firebase/firestore");

        unsub = onSnapshot(
          doc(db, "config", "features"),
          { includeMetadataChanges: true },
          (snap) => {
            if (!navigator.onLine) return; // offline banner already handles this

            // Admin-controlled maintenance banner: set maintenanceBanner=true in
            // Firestore console (config/features) to show this to all users instantly.
            if (!snap.metadata.fromCache && snap.data()?.maintenanceBanner === true) {
              if (platformTimer.current) { clearTimeout(platformTimer.current); platformTimer.current = null; }
              set("platform_down");
              return;
            }

            if (snap.metadata.fromCache) {
              // Firestore is reading from local cache — might be down.
              // Wait 6 s before declaring a platform outage to avoid false positives
              // during normal startup.
              if (!platformTimer.current && statusRef.current !== "platform_down") {
                platformTimer.current = setTimeout(() => {
                  platformTimer.current = null;
                  if (navigator.onLine && statusRef.current !== "offline") {
                    set("platform_down");
                  }
                }, 6000);
              }
            } else {
              // Backend is reachable — clear any platform outage.
              if (platformTimer.current) {
                clearTimeout(platformTimer.current);
                platformTimer.current = null;
              }
              if (statusRef.current === "platform_down") {
                set("reconnected");
                setTimeout(() => { if (statusRef.current === "reconnected") set("ok"); }, 3000);
              } else if (statusRef.current !== "offline" && statusRef.current !== "reconnected") {
                set("ok");
              }
            }
          },
          () => {
            // onSnapshot error = Firestore definitely unreachable
            if (navigator.onLine && statusRef.current !== "offline") {
              set("platform_down");
            }
          }
        );
      } catch {
        // firebase/firestore not available in this context — skip
      }
    }

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (platformTimer.current) clearTimeout(platformTimer.current);
      if (unsub) unsub();
    };
  }, []);

  if (status === "ok") return null;

  // Full-screen takeover for platform outage — replaces whatever broken UI is beneath
  if (status === "platform_down") return <OutageScreen />;

  const isReconnected = status === "reconnected";

  const bg = isReconnected ? "rgba(34,197,94,0.97)" : "rgba(17,17,17,0.97)";
  const border = isReconnected ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.3)";
  const icon = isReconnected ? "check_circle" : "wifi_off";
  const iconColor = isReconnected ? "#fff" : "#ef4444";

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 16px",
        background: bg,
        borderBottom: `1px solid ${border}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        animation: "slideDown 0.3s ease",
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 16, color: iconColor, fontVariationSettings: "'FILL' 1", flexShrink: 0 }}
      >
        {icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isReconnected ? "#fff" : "#f87171" }}>
          {isReconnected ? "Back online" : "No internet connection"}
        </span>
        {!isReconnected && (
          <span style={{ fontSize: 11, color: "#555", marginLeft: 6 }}>
            Some features may not work
          </span>
        )}
      </div>
    </div>
  );
}
