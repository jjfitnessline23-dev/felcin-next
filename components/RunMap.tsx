"use client";

import { useRef, useEffect, useState } from "react";

interface Coord { lat: number; lng: number }
interface Props {
  coords: Coord[];
  currentPos: Coord | null;
  heading?: number | null;
  followUser: boolean;
  fullscreen: boolean;
  completed?: boolean;
  matchedCoords?: Coord[];
}

const START_HTML = `
  <div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:22px;height:22px;border-radius:50%;background:#fff;border:2.5px solid #22c55e;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)">
      <div style="width:7px;height:7px;border-radius:50%;background:#22c55e"></div>
    </div>
    <div style="width:2px;height:8px;background:#22c55e;opacity:0.7"></div>
  </div>`;

const FINISH_HTML = `
  <div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:22px;height:22px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(34,197,94,0.5);font-size:11px">
      ✓
    </div>
    <div style="width:2px;height:8px;background:#22c55e;opacity:0.7"></div>
  </div>`;

function gpsHtml(heading: number | null | undefined) {
  if (heading == null) {
    // No heading yet — plain pulsing dot
    return `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(74,222,128,0.25);animation:runPulse 1.8s ease-out infinite"></div>
        <div style="width:15px;height:15px;border-radius:50%;background:#4ade80;border:2.5px solid #fff;box-shadow:0 0 14px rgba(74,222,128,0.85);position:relative;z-index:1"></div>
      </div>`;
  }
  // Directional arrow pointing in direction of travel
  return `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(74,222,128,0.2);animation:runPulse 1.8s ease-out infinite"></div>
      <div style="transform:rotate(${Math.round(heading)}deg);position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 0 8px rgba(74,222,128,0.9))">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="10" fill="#4ade80" stroke="white" stroke-width="2.5"/>
          <path d="M14 5L19 17L14 13.5L9 17L14 5Z" fill="white"/>
        </svg>
      </div>
    </div>`;
}

export default function RunMap({ coords, currentPos, heading, followUser, fullscreen, completed, matchedCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);
  const hasFlownRef = useRef(false);
  const prevCompletedRef = useRef(false);
  const coordsRef = useRef<Coord[]>([]);
  const headingRef = useRef<number | null | undefined>(heading);

  // Becomes true once Leaflet has initialised — re-triggers all dependent effects
  const [mapInit, setMapInit] = useState(false);
  // Stays true until the map is centred on the user — hides the [0,0] Africa flash
  const [mapCover, setMapCover] = useState(true);

  // ── Mount: initialise Leaflet at the user's current position ─────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Snapshot the position NOW so we start the map there, not at [0,0] (Africa)
    const initPos = currentPos;

    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;

      const map = L.map(containerRef.current, {
        center: initPos ? [initPos.lat, initPos.lng] : [0, 0],
        zoom: initPos ? 17 : 2,
        zoomControl: false,
        attributionControl: false,
      });

      // MapTiler streets-v2-dark — full street name labels at every zoom level
      const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
      L.tileLayer(
        `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${maptilerKey}`,
        { maxZoom: 20, tileSize: 256, attribution: "" }
      ).addTo(map);

      mapRef.current = map;
      if (initPos) hasFlownRef.current = true;

      // Signal all dependent effects to run now that the map is ready
      setMapInit(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        routeRef.current = null;
        startMarkerRef.current = null;
        currentMarkerRef.current = null;
        hasFlownRef.current = false;
        prevCompletedRef.current = false;
      }
    };
  }, []); // eslint-disable-line

  // ── Resize on fullscreen toggle ───────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // ── Heading: update the direction arrow without waiting for a position change ──
  useEffect(() => {
    headingRef.current = heading;
    if (!currentMarkerRef.current || completed || heading == null) return;
    import("leaflet").then((L) => {
      if (!currentMarkerRef.current) return;
      const icon = L.divIcon({ className: "", html: gpsHtml(heading), iconSize: [44, 44], iconAnchor: [22, 22] });
      currentMarkerRef.current.setIcon(icon);
    });
  }, [heading, completed]);

  // ── Route polyline + start marker ─────────────────────────────────────────
  const displayCoords = matchedCoords && matchedCoords.length >= 2 ? matchedCoords : coords;

  useEffect(() => {
    coordsRef.current = coords;
    if (!mapRef.current || !mapInit) return;

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      const latlngs = displayCoords.map(c => [c.lat, c.lng] as [number, number]);

      // Update polyline in-place to avoid remove/redraw race conditions
      if (displayCoords.length >= 2) {
        if (routeRef.current) {
          routeRef.current.setLatLngs(latlngs);
        } else {
          routeRef.current = L.polyline(latlngs, { color: "#4ade80", weight: 5, opacity: 0.95 }).addTo(mapRef.current);
        }
      } else if (routeRef.current) {
        routeRef.current.remove();
        routeRef.current = null;
      }

      // Start marker at first GPS point
      if (coords.length > 0 && !startMarkerRef.current) {
        const icon = L.divIcon({ className: "", html: START_HTML, iconSize: [22, 30], iconAnchor: [11, 30] });
        startMarkerRef.current = L.marker([coords[0].lat, coords[0].lng], { icon, zIndexOffset: 10 }).addTo(mapRef.current);
      }
    });
  }, [coords, matchedCoords, mapInit]); // eslint-disable-line

  // ── Current position dot / finish flag + camera ───────────────────────────
  useEffect(() => {
    if (!mapRef.current || !currentPos || !mapInit) return;

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      const justCompleted = completed && !prevCompletedRef.current;
      prevCompletedRef.current = !!completed;

      // Create or update the position marker
      if (!currentMarkerRef.current) {
        const html = completed ? FINISH_HTML : gpsHtml(headingRef.current);
        const size: [number, number] = completed ? [22, 30] : [44, 44];
        const anchor: [number, number] = completed ? [11, 30] : [22, 22];
        const icon = L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor });
        currentMarkerRef.current = L.marker(
          [currentPos.lat, currentPos.lng],
          { icon, zIndexOffset: 100 }
        ).addTo(mapRef.current);
      } else {
        currentMarkerRef.current.setLatLng([currentPos.lat, currentPos.lng]);
        if (justCompleted) {
          const icon = L.divIcon({ className: "", html: FINISH_HTML, iconSize: [22, 30], iconAnchor: [11, 30] });
          currentMarkerRef.current.setIcon(icon);
        } else if (!completed) {
          // Refresh the direction arrow whenever position updates
          const icon = L.divIcon({ className: "", html: gpsHtml(headingRef.current), iconSize: [44, 44], iconAnchor: [22, 22] });
          currentMarkerRef.current.setIcon(icon);
        }
      }

      // Camera
      const fitSrc = matchedCoords && matchedCoords.length > 1 ? matchedCoords : coordsRef.current;
      if (justCompleted && fitSrc.length > 1) {
        const bounds = L.latLngBounds(fitSrc.map(c => [c.lat, c.lng] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [60, 40], animate: true, duration: 0.9 });
        setMapCover(false);
      } else if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        mapRef.current.setView([currentPos.lat, currentPos.lng], 17, { animate: false });
        setMapCover(false);
      } else if (followUser) {
        mapRef.current.panTo([currentPos.lat, currentPos.lng], { animate: true, duration: 0.7 });
        setMapCover(false);
      } else {
        setMapCover(false);
      }
    });
  }, [currentPos, followUser, completed, matchedCoords, mapInit]); // eslint-disable-line

  return (
    <>
      <style>{`
        @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        @keyframes runPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .leaflet-container { background: #1a1a2e !important; }
        .leaflet-grab { cursor: default; }
        .leaflet-dragging .leaflet-grab { cursor: grabbing; }
      `}</style>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {/* Dark cover hides the [0,0] Africa flash until the map is centred */}
        {mapCover && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 1000,
            background: "#0a0a0a",
            pointerEvents: "none",
          }} />
        )}
      </div>
    </>
  );
}
