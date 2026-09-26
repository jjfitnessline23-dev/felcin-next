import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { sanitizePost } from "@/lib/sanitize";

// Server-side fetch of the first page of the global "For You" feed.
// This query is identical for every user (posts, newest first), so it can be
// fetched once on the server, cached at the edge, and used to seed the client —
// eliminating the largest client Firestore round-trip from the critical path.
//
// Returns plain, JSON-serializable objects (sanitizePost converts Firestore
// Timestamps to { seconds }). Falls back to [] if admin isn't configured, so the
// client simply behaves exactly as it does today (fetches on mount).

const PAGE_SIZE = 12;

async function fetchInitialFeedUncached(): Promise<Record<string, unknown>[]> {
  const app = getAdminApp();
  if (!app) return [];
  try {
    const snap = await app
      .firestore()
      .collection("posts")
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE * 2) // over-fetch a little; filtering drops stories/expired
      .get();

    const posts = snap.docs
      .map((d) => sanitizePost(d.data() as Record<string, unknown>, d.id))
      .filter(
        (p) =>
          p.status !== "scheduled" &&
          !p.isStory &&
          (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews),
      )
      .slice(0, PAGE_SIZE);

    return posts as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// Cache across requests for 30s. Repeated page loads within the window are served
// from the Next data cache instead of re-querying Firestore.
//
// The Capacitor static-export build (`output: export`) can't use ISR/revalidate and
// has no server to run admin against, so there we skip the cache entirely and just
// return [] — the native app seeds nothing and fetches on the client exactly as
// before. This keeps the export build free of any revalidate usage from this module.
const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export const getInitialFeed = IS_CAP_BUILD
  ? async (): Promise<Record<string, unknown>[]> => []
  : unstable_cache(fetchInitialFeedUncached, ["home-initial-feed-v1"], {
      revalidate: 30,
      tags: ["home-feed"],
    });
