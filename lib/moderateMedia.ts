// Client-side nudity gate. Call assertMediaClean(file, getToken) right before any
// image or video is published/uploaded anywhere in the app (posts, reels, stories,
// avatars, ads, DMs, progress photos, ghost videos). It downsamples the media in
// the browser, sends it to /api/moderate-image, and throws NudityBlockedError when
// the media contains disallowed nudity so the caller can abort and show a message.
//
// It fails OPEN on any inspection/network problem (unsupported format, decode
// failure, API outage) — the server-side moderation cron is the backstop that
// catches anything that slips through here. It NEVER fails open on an explicit
// "blocked" verdict.

export class NudityBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NudityBlockedError";
  }
}

const DEFAULT_MESSAGE =
  "This media appears to contain nudity or sexual content, which isn't allowed on Felcin. Please choose different media.";

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;
const VIDEO_RE = /\.(mp4|mov|avi|webm|mkv|m4v|3gp|hevc|ts|mts|wmv|flv)$/i;

function isVideoFile(file: File): boolean {
  return (file.type || "").startsWith("video/") || VIDEO_RE.test(file.name || "");
}

function isImageFile(file: File): boolean {
  return (file.type || "").startsWith("image/") || IMAGE_RE.test(file.name || "");
}

// Decode an image file and return a downscaled JPEG data URL, or null if it can't
// be decoded in this browser (e.g. HEIC on Chrome).
async function imageToJpegDataUrl(file: File, maxDim = 1024): Promise<string | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Sample a few evenly-spaced frames from a video as JPEG data URLs. Returns [] if
// the browser can't decode the video (falls back to the cron backstop).
async function videoToFrameDataUrls(file: File, maxDim = 720, frames = 4): Promise<string[]> {
  if (typeof document === "undefined") return [];
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    const out: string[] = [];
    let targets: number[] = [];
    let idx = 0;
    let settled = false;

    const cleanup = () => { URL.revokeObjectURL(url); };
    const finish = () => { if (settled) return; settled = true; cleanup(); resolve(out); };
    // Hard timeout so a stuck/undecodable video never hangs publishing.
    const timer = setTimeout(finish, 8000);
    const done = () => { clearTimeout(timer); finish(); };

    const grab = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth || 1, video.videoHeight || 1));
        const w = Math.max(1, Math.round((video.videoWidth || maxDim) * scale));
        const h = Math.max(1, Math.round((video.videoHeight || maxDim) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          out.push(canvas.toDataURL("image/jpeg", 0.75));
        }
      } catch { /* skip this frame */ }
      idx++;
      if (idx < targets.length) {
        video.currentTime = targets[idx];
      } else {
        done();
      }
    };

    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (dur > 0) {
        // Evenly spaced frames across the clip (skip the very first/last moments).
        targets = Array.from({ length: frames }, (_, i) => Math.min(dur - 0.05, (dur * (i + 0.5)) / frames));
      } else {
        targets = [0.1];
      }
      video.currentTime = targets[0];
    };
    video.onseeked = grab;
    video.onerror = () => { clearTimeout(timer); finish(); };
    video.src = url;
  });
}

async function extractImages(file: File): Promise<string[]> {
  if (isVideoFile(file)) return videoToFrameDataUrls(file);
  if (isImageFile(file)) {
    const one = await imageToJpegDataUrl(file);
    return one ? [one] : [];
  }
  return []; // audio or unknown → nothing to inspect visually
}

/**
 * Throws NudityBlockedError when the file contains disallowed nudity/sexual content.
 * Resolves silently when the media is clean OR can't be inspected (cron backstops).
 *
 * @param file      the image or video File the user is about to upload/publish
 * @param getToken  returns a Firebase ID token (e.g. () => user.getIdToken())
 */
export async function assertMediaClean(file: File, getToken: () => Promise<string>): Promise<void> {
  let images: string[];
  try {
    images = await extractImages(file);
  } catch {
    return; // extraction failed → fail open
  }
  if (!images.length) return;

  let token = "";
  try {
    token = await getToken();
  } catch {
    return; // no auth token → fail open (server would 401 anyway)
  }

  let res: Response | null = null;
  try {
    res = await fetch("/api/moderate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ images }),
    });
  } catch {
    return; // network error → fail open, cron backstops
  }

  if (!res || !res.ok) return; // 401/429/5xx → fail open

  let data: { blocked?: boolean; reason?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    return;
  }

  if (data?.blocked) {
    throw new NudityBlockedError(DEFAULT_MESSAGE);
  }
}
