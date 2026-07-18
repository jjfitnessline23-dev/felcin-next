// Valhalla polyline6 decoder (6 decimal precision)
function decodePolyline6(encoded: string): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, bits = 0;
    do { b = encoded.charCodeAt(i++) - 63; bits |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += bits & 1 ? ~(bits >> 1) : bits >> 1;
    shift = bits = 0;
    do { b = encoded.charCodeAt(i++) - 63; bits |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += bits & 1 ? ~(bits >> 1) : bits >> 1;
    pts.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return pts;
}

export async function snapToRoads(
  raw: { lat: number; lng: number }[]
): Promise<{ lat: number; lng: number }[] | null> {
  if (raw.length < 2) return null;
  const MAX = 100;
  const step = Math.max(1, Math.ceil(raw.length / MAX));
  const pts = raw.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== raw[raw.length - 1]) pts.push(raw[raw.length - 1]);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://valhalla1.openstreetmap.de/trace_route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        shape: pts.map((c, i) => ({ lat: c.lat, lon: c.lng, time: i * 10 })),
        costing: "pedestrian",
        shape_match: "walk_or_snap",
        trace_options: { interpolation_distance: 5 },
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const shape = data.trip?.legs?.[0]?.shape;
    return shape ? decodePolyline6(shape) : null;
  } catch {
    return null;
  }
}
