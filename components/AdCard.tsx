"use client";

import { useEffect, useRef } from "react";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Ad {
  _isAd: true;
  id: string;
  title: string;
  adBody?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  linkUrl: string;
  advertiserId: string;
  advertiserName: string;
  advertiserPhoto?: string;
}

export default function AdCard({ ad }: { ad: Ad }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const impressedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !impressedRef.current) {
        impressedRef.current = true;
        updateDoc(doc(db, "ads", ad.id), { impressions: increment(1) }).catch(() => {});
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ad.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.25 });
    obs.observe(v);
    return () => obs.disconnect();
  }, []);

  const handleClick = () => {
    updateDoc(doc(db, "ads", ad.id), { clicks: increment(1) }).catch(() => {});
    window.open(ad.linkUrl, "_blank", "noopener,noreferrer");
  };

  const init = (ad.advertiserName || "A").charAt(0).toUpperCase();

  return (
    <article ref={cardRef} style={{
      background: "#0e0e0e",
      border: "1px solid rgba(124,58,237,0.18)",
      borderRadius: 20,
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Purple left accent */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, #7C3AED, #a78bfa)", borderRadius: "20px 0 0 20px" }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 10px 20px" }}>
        {ad.advertiserPhoto ? (
          <img src={ad.advertiserPhoto} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid rgba(124,58,237,0.3)" }} />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(124,58,237,0.15)", border: "2px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700, fontSize: 14, color: "#a78bfa" }}>{init}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#f2f2f2", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.advertiserName}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#a78bfa", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", padding: "1px 7px", borderRadius: 50 }}>SPONSORED</span>
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#333" }}>more_horiz</span>
      </div>

      {/* Media */}
      <div onClick={handleClick} style={{ position: "relative", background: "#111", aspectRatio: "4/3", overflow: "hidden", cursor: "pointer" }}>
        {ad.mediaType === "video" ? (
          <video ref={videoRef} src={ad.mediaUrl} muted loop playsInline preload="auto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <img src={ad.mediaUrl} alt={ad.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {/* Gradient overlay at bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }} />
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px 16px 20px" }}>
        {ad.title && (
          <p style={{ fontSize: 15, fontWeight: 700, color: "#f2f2f2", margin: "0 0 4px" }}>{ad.title}</p>
        )}
        {ad.adBody && (
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px", lineHeight: 1.55 }}>{ad.adBody}</p>
        )}
        <button onClick={handleClick} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          background: "linear-gradient(135deg, #7C3AED, #a855f7)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          border: "none", cursor: "pointer", letterSpacing: "0.03em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
          Learn More
        </button>
      </div>
    </article>
  );
}
