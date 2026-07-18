"use client";

import { useRef, useEffect } from "react";

interface Coord { lat: number; lng: number }
interface Props {
  coords: Coord[];
  currentPos: Coord | null;
  followUser: boolean;
  fullscreen: boolean;
  completed?: boolean;
  matchedCoords?: Coord[]; // road-snapped route from Valhalla; falls back to coords if null
}

const START_HTML = `
  <div style="display:flex;flex-direction:column;align-items:center;gap:0">
    <div style="width:22px;height:22px;border-radius:50%;background:#fff;border:2.5px solid #22c55e;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)">
      <div style="width:7px;height:7px;border-radius:50%;background:#22c55e"></div>
    </div>
    <div style="width:2px;height:8px;background:#22c55e;opacity:0.7"></div>
  </div>`;

const FINISH_HTML = `
  <div style="display:flex;flex-direction:column;align-items:center;gap:0">
    <div style="width:22px;height:22px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(34,197,94,0.5);font-size:11px">
      ✓
    </div>
    <div style="width:2px;height:8px;background:#22c55e;opacity:0.7"></div>
  </div>`;

const GPS_HTML = `
  <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(74,222,128,0.25);animation:runPulse 1.8s ease-out infinite"></div>
    <div style="width:15px;height:15px;border-radius:50%;background:#4ade80;border:2.5px solid #fff;box-shadow:0 0 14px rgba(74,222,128,0.85);position:relative;z-index:1"></div>
  </div>`;

export default function RunMap({ coords, currentPos, followUser, fullscreen, completed, matchedCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);
  const hasFlownRef = useRef(false);
  const prevCompletedRef = useRef(false);
  const coordsRef = useRef<Coord[]>([]); // latest coords accessible from all effects

  // Mount map once — capture currentPos at mount time so the map starts
  // at the user's location instead of [0,0] (Africa) and flying in.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initPos = currentPos; // snapshot from first render

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

      // CartoDB dark tiles — Canvas 2D, works in all WKWebView versions
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      mapRef.current = map;

      // Already centred — skip the fly-to in the currentPos effect
      if (initPos) hasFlownRef.current = true;
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
  }, []);

  // Resize on fullscreen toggle
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // Route polyline + start marker
  // Use road-snapped coords if available, raw GPS as fallback
  const displayCoords = matchedCoords && matchedCoords.length >= 2 ? matchedCoords : coords;

  useEffect(() => {
    coordsRef.current = coords;
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      // Route line — prefer matched (road-snapped) over raw GPS
      if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
      if (displayCoords.length >= 2) {
        routeRef.current = L.polyline(
          displayCoords.map(c => [c.lat, c.lng] as [number, number]),
          { color: "#4ade80", weight: 5, opacity: 0.95 }
        ).addTo(mapRef.current);
      }

      // Start marker at first GPS point
      if (coords.length > 0 && !startMarkerRef.current) {
        const icon = L.divIcon({
          className: "",
          html: START_HTML,
          iconSize: [22, 30],
          iconAnchor: [11, 30],
        });
        startMarkerRef.current = L.marker(
          [coords[0].lat, coords[0].lng],
          { icon, zIndexOffset: 10 }
        ).addTo(mapRef.current);
      }
    });
  }, [coords, matchedCoords]); // eslint-disable-line

  // Current position dot (or finish flag when completed)
  useEffect(() => {
    if (!mapRef.current || !currentPos) return;
    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      const justCompleted = completed && !prevCompletedRef.current;
      prevCompletedRef.current = !!completed;

      if (!currentMarkerRef.current) {
        const html = completed ? FINISH_HTML : GPS_HTML;
        const size: [number, number] = completed ? [22, 30] : [34, 34];
        const anchor: [number, number] = completed ? [11, 30] : [17, 17];
        const icon = L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor });
        currentMarkerRef.current = L.marker(
          [currentPos.lat, currentPos.lng],
          { icon, zIndexOffset: 100 }
        ).addTo(mapRef.current);
      } else {
        currentMarkerRef.current.setLatLng([currentPos.lat, currentPos.lng]);

        // Swap icon from GPS dot → finish flag when run ends
        if (justCompleted) {
          const icon = L.divIcon({
            className: "",
            html: FINISH_HTML,
            iconSize: [22, 30],
            iconAnchor: [11, 30],
          });
          currentMarkerRef.current.setIcon(icon);
        }
      }

      const fitSrc = matchedCoords && matchedCoords.length > 1 ? matchedCoords : coordsRef.current;
      if (justCompleted && fitSrc.length > 1) {
        const bounds = L.latLngBounds(fitSrc.map(c => [c.lat, c.lng] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [60, 40], animate: true, duration: 0.9 });
      } else if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        mapRef.current.setView([currentPos.lat, currentPos.lng], 17, { animate: true, duration: 1 });
      } else if (followUser) {
        mapRef.current.panTo([currentPos.lat, currentPos.lng], { animate: true, duration: 0.7 });
      }
    });
  }, [currentPos, followUser, completed]);

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
