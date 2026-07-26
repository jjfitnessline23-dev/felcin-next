// lib/sanitize.ts — Defensive type coercion for all Firestore data
//
// Firestore can return unexpected types when:
//   - Pending writes haven't synced (FieldValue objects instead of numbers/arrays)
//   - Old documents were written with a different schema
//   - Native Capacitor plugin path serialized data differently
//
// Every function here guarantees a safe output type regardless of input.

export function safeString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

export function safeNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v == null) return fallback;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export function safeArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

export function safeStringArray(v: unknown): string[] {
  return safeArray<unknown>(v).filter((x): x is string => typeof x === "string");
}

export function safeTimestamp(v: unknown): { seconds: number } | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && typeof (v as { seconds?: unknown }).seconds === "number") {
    return { seconds: (v as { seconds: number }).seconds };
  }
  return null;
}

export function safeBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

// Sanitize a raw Firestore post document into a safe, typed Post object.
export function sanitizePost(raw: Record<string, unknown>, id: string) {
  return {
    id,
    authorId: safeString(raw.authorId),
    authorName: safeString(raw.authorName),
    authorPhoto: safeString(raw.authorPhoto),
    caption: safeString(raw.caption),
    text: safeString(raw.text),
    mediaUrl: safeString(raw.mediaUrl),
    contentType: safeString(raw.contentType),
    mimeType: safeString(raw.mimeType),
    likes: safeNumber(raw.likes),
    comments: safeNumber(raw.comments),
    likedBy: safeStringArray(raw.likedBy),
    createdAt: safeTimestamp(raw.createdAt),
    status: safeString(raw.status),
    isStory: safeBoolean(raw.isStory),
    maxViews: raw.maxViews != null ? safeNumber(raw.maxViews) : null,
    viewCount: safeNumber(raw.viewCount),
    badge: raw.badge != null ? safeString(raw.badge) : undefined,
    verified: raw.verified != null ? safeBoolean(raw.verified) : undefined,
    isPPV: raw.isPPV != null ? safeBoolean(raw.isPPV) : undefined,
    ppvPrice: raw.ppvPrice != null ? safeNumber(raw.ppvPrice) : undefined,
    thumbnailUrl: raw.thumbnailUrl != null ? safeString(raw.thumbnailUrl) : undefined,
    duration: raw.duration != null ? safeNumber(raw.duration) : undefined,
    tags: safeStringArray(raw.tags),
    challengeId: raw.challengeId != null ? safeString(raw.challengeId) : undefined,
    liveId: raw.liveId != null ? safeString(raw.liveId) : undefined,
  };
}
