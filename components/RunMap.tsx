"use client";

import { useRef, useEffect } from "react";

interface Coord { lat: number; lng: number }
interface Props {
  coords: Coord[];
  currentPos: Coord | null;
  followUser: boolean;
  fullscreen: boolean;
}

export default function RunMap({ coords, currentPos, followUser, fullscreen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const hasFlownRef = useRef(false);

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // Leaflet's default icon asset resolution breaks in Next.js — clear it
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;

      const map = L.map(containerRef.current, {
        center: [0, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: false,
      });

      // CartoDB dark tiles — Canvas 2D, no WebGL, works in all WKWebView versions
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        routeRef.current = null;
        markerRef.current = null;
        hasFlownRef.current = false;
      }
    };
  }, []);

  // Resize when idle/fullscreen toggles
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // Update route polyline
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
      if (coords.length >= 2) {
        routeRef.current = L.polyline(
          coords.map(c => [c.lat, c.lng] as [number, number]),
          { color: "#4ade80", weight: 5, opacity: 0.95 }
        ).addTo(mapRef.current);
      }
    });
  }, [coords]);

  // Update GPS dot + pan/fly
  useEffect(() => {
    if (!mapRef.current || !currentPos) return;
    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      if (!markerRef.current) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px">
            <div style="position:absolute;inset:0;border-radius:50%;background:rgba(74,222,128,0.25);animation:runPulse 1.8s ease-out infinite"></div>
            <div style="width:15px;height:15px;border-radius:50%;background:#4ade80;border:2.5px solid #fff;box-shadow:0 0 14px rgba(74,222,128,0.85);position:relative;z-index:1"></div>
          </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        markerRef.current = L.marker([currentPos.lat, currentPos.lng], { icon })
          .addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([currentPos.lat, currentPos.lng]);
      }

      if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        mapRef.current.setView([currentPos.lat, currentPos.lng], 17, { animate: true, duration: 1 });
      } else if (followUser) {
        mapRef.current.panTo([currentPos.lat, currentPos.lng], { animate: true, duration: 0.7 });
      }
    });
  }, [currentPos, followUser]);

  return (
    <>
      <style>{`
        @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        @keyframes runPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .leaflet-container { background: #0a0a0a !important; }
        .leaflet-grab { cursor: default; }
        .leaflet-dragging .leaflet-grab { cursor: grabbing; }
      `}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#0a0a0a" }} />
    </>
  );
}
