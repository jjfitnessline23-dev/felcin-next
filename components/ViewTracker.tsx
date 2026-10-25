"use client";

// Pings /api/track-view once per browser per day so website visits (including
// logged-out visitors) get counted. The server also dedupes by IP+day, so this is
// just the lightweight trigger.

import { useEffect } from "react";

export default function ViewTracker() {
  useEffect(() => {
    try {
      const key = "felcin_visit_" + new Date().toISOString().split("T")[0];
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      fetch("/api/track-view", { method: "POST", keepalive: true }).catch(() => {});
    } catch { /* ignore */ }
  }, []);
  return null;
}
