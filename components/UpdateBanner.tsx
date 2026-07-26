"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const STORE_URL = "https://apps.apple.com/app/id6763660775";
const ITUNES_API = "https://itunes.apple.com/lookup?bundleId=com.felcin.app";

export default function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [storeVersion, setStoreVersion] = useState("");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        const installed = info.version;

        const res = await fetch(ITUNES_API);
        const data = await res.json();
        const latest: string = data?.results?.[0]?.version ?? "";

        if (latest && compareVersions(latest, installed) > 0) {
          setStoreVersion(latest);
          setShow(true);
        }
      } catch {}
    })();
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(135deg,#7C3AED,#a855f7)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#fff", flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>
        system_update
      </span>
      <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>
        Felcin {storeVersion} is available
      </p>
      <a
        href={STORE_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#fff",
          background: "rgba(255,255,255,0.25)",
          padding: "5px 12px",
          borderRadius: 999,
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        Update
      </a>
      <button
        onClick={() => setShow(false)}
        style={{ background: "none", border: "none", padding: 4, cursor: "pointer", flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>close</span>
      </button>
    </div>
  );
}
