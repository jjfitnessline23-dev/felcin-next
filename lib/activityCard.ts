// Generates a shareable 1080×1080 activity card (PNG blob) client-side via canvas.
// Used by the run + workout "share to feed" flows to post VISUAL content (higher reach)
// instead of plain text. Returns null on any failure so callers can fall back to text.

export interface ActivityCardOpts {
  kind: "run" | "cycle" | "workout";
  headline: string;            // big line, e.g. "5.20 km" or "WORKOUT"
  stats: { label: string; value: string }[]; // up to 3 stat columns
  badge?: string;              // e.g. "DISTANCE PR" (no emoji — canvas emoji is unreliable)
  coords?: { lat: number; lng: number }[]; // run route (optional)
  userName?: string;
}

const ACCENT = "#22c55e";

export async function makeActivityCard(opts: ActivityCardOpts): Promise<Blob | null> {
  try {
    if (typeof document === "undefined") return null;
    const S = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background
    const bg = ctx.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, "#07130d");
    bg.addColorStop(1, "#0b1f16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    // subtle accent glow top-right
    const glow = ctx.createRadialGradient(S * 0.85, S * 0.12, 0, S * 0.85, S * 0.12, S * 0.6);
    glow.addColorStop(0, "rgba(34,197,94,0.14)");
    glow.addColorStop(1, "rgba(34,197,94,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);

    // Brand wordmark
    ctx.fillStyle = ACCENT;
    ctx.font = "800 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("FELCIN", 72, 108);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 30px system-ui, sans-serif";
    const kindLabel = opts.kind === "cycle" ? "RIDE" : opts.kind === "workout" ? "WORKOUT" : "RUN";
    ctx.fillText(kindLabel, 74, 150);

    // Route map (runs/rides) in the middle band
    if (opts.coords && opts.coords.length > 1) {
      drawRoute(ctx, opts.coords, 72, 210, S - 144, 470);
    } else {
      // Workout: a big centered glyph block instead of a map
      ctx.fillStyle = "rgba(34,197,94,0.08)";
      roundRect(ctx, 72, 210, S - 144, 470, 28);
      ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.font = "800 190px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opts.kind === "workout" ? "✦" : "●", S / 2, 530);
      ctx.textAlign = "left";
    }

    // Badge (PR)
    let y = 770;
    if (opts.badge) {
      ctx.fillStyle = "rgba(251,191,36,0.16)";
      const bw = ctx.measureText(opts.badge).width;
      roundRect(ctx, 72, y - 36, Math.max(180, bw + 120), 54, 27);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.font = "800 28px system-ui, sans-serif";
      ctx.fillText("★ " + opts.badge, 100, y);
      y += 70;
    }

    // Headline
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.fillText(opts.headline, 68, y + 70);
    y += 130;

    // Stats row
    const stats = opts.stats.slice(0, 3);
    const colW = (S - 144) / Math.max(1, stats.length);
    stats.forEach((st, i) => {
      const x = 72 + i * colW;
      ctx.fillStyle = ACCENT;
      ctx.font = "800 48px system-ui, sans-serif";
      ctx.fillText(st.value, x, y + 90);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "600 26px system-ui, sans-serif";
      ctx.fillText(st.label.toUpperCase(), x, y + 128);
    });

    // User name footer
    if (opts.userName) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "600 28px system-ui, sans-serif";
      ctx.fillText(opts.userName, 72, S - 54);
    }

    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
  } catch {
    return null;
  }
}

function drawRoute(ctx: CanvasRenderingContext2D, coords: { lat: number; lng: number }[], x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  const lats = coords.map((c) => c.lat), lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 56;
  const bw = w - pad * 2, bh = h - pad * 2;
  const spanLat = Math.max(1e-6, maxLat - minLat);
  const spanLng = Math.max(1e-6, maxLng - minLng);
  // preserve aspect ratio: fit within the box
  const scale = Math.min(bw / spanLng, bh / spanLat);
  const offX = x + pad + (bw - spanLng * scale) / 2;
  const offY = y + pad + (bh - spanLat * scale) / 2;
  const px = (lng: number) => offX + (lng - minLng) * scale;
  const py = (lat: number) => offY + (maxLat - lat) * scale; // invert lat (north up)

  ctx.beginPath();
  coords.forEach((c, i) => { const X = px(c.lng), Y = py(c.lat); i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); });
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 9;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(34,197,94,0.5)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // start + end dots
  const s0 = coords[0], e0 = coords[coords.length - 1];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(px(s0.lng), py(s0.lat), 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(px(e0.lng), py(e0.lat), 11, 0, Math.PI * 2); ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
