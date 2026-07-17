"use client";

import { useRef, useEffect, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

interface Coord { lat: number; lng: number }

interface Props {
  coords: Coord[];
  currentPos: Coord | null;
  followUser: boolean;
  fullscreen: boolean;
}

export default function RunMap({ coords, currentPos, followUser, fullscreen }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasInitialFlownRef = useRef(false);

  // Fly to user the first time we get a position; ease-to on subsequent updates when following
  useEffect(() => {
    if (!mapReady || !currentPos || !mapRef.current) return;

    if (!hasInitialFlownRef.current) {
      hasInitialFlownRef.current = true;
      mapRef.current.flyTo({
        center: [currentPos.lng, currentPos.lat],
        zoom: 17,
        speed: 1.6,
      });
      return;
    }

    if (followUser) {
      mapRef.current.easeTo({
        center: [currentPos.lng, currentPos.lat],
        duration: 700,
        easing: (t) => t * (2 - t),
      });
    }
  }, [currentPos, followUser, mapReady]);

  // Resize when the container switches between 52dvh and full-screen
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return (
    <div style={{ width: "100%", height: "100%", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#444", fontSize: 12 }}>NEXT_PUBLIC_MAPTILER_KEY missing</p>
    </div>
  );

  const geoJson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords.map(c => [c.lng, c.lat]) },
    properties: {},
  };

  return (
    <>
      <style>{`
        @keyframes runPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
      `}</style>
      <Map
        ref={mapRef}
        onLoad={() => setMapReady(true)}
        initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={`https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`}
        attributionControl={false}
      >
        {coords.length >= 2 && (
          <Source id="route" type="geojson" data={geoJson}>
            <Layer id="route-glow" type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#4ade80", "line-width": 14, "line-opacity": 0.14, "line-blur": 5 }} />
            <Layer id="route-line" type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#4ade80", "line-width": 5, "line-opacity": 0.95 }} />
          </Source>
        )}

        {currentPos && (
          <Marker longitude={currentPos.lng} latitude={currentPos.lat} anchor="center">
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                position: "absolute", width: 34, height: 34, borderRadius: "50%",
                background: "rgba(74,222,128,0.25)",
                animation: "runPulse 1.8s ease-out infinite",
              }} />
              <div style={{
                width: 15, height: 15, borderRadius: "50%",
                background: "#4ade80", border: "2.5px solid #fff",
                boxShadow: "0 0 14px rgba(74,222,128,0.85)",
                position: "relative", zIndex: 1,
              }} />
            </div>
          </Marker>
        )}
      </Map>
    </>
  );
}
