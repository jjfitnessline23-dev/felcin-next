"use client";

import { useState, useEffect } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOnline && !justReconnected) return null;

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
        padding: "8px 16px",
        background: justReconnected
          ? "rgba(34,197,94,0.95)"
          : "rgba(17,17,17,0.97)",
        borderBottom: `1px solid ${justReconnected ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.3)"}`,
        backdropFilter: "blur(12px)",
        animation: "slideDown 0.25s ease",
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 16,
          color: justReconnected ? "#fff" : "#ef4444",
          fontVariationSettings: "'FILL' 1",
        }}
      >
        {justReconnected ? "wifi" : "wifi_off"}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: justReconnected ? "#fff" : "#f87171",
          letterSpacing: "0.01em",
        }}
      >
        {justReconnected ? "Back online" : "No internet connection"}
      </span>
      {!justReconnected && (
        <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>
          Some features may not work
        </span>
      )}
    </div>
  );
}
