import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminApp } from "@/lib/firebaseAdmin";

// Server-side read of a user's PUBLIC profile + recent public posts, for the
// SEO-indexed /u/[uid] pages. Uses firebase-admin (bypasses security rules) so
// unauthenticated crawlers get real content in the HTML.
//
// The Capacitor static-export build has no server and no admin creds, so there
// we short-circuit to null (the native app never serves /u pages).

const IS_CAP_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export interface PublicProfilePost {
  id: string;
  mediaUrl: string;
  caption: string;
  isVideo: boolean;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  bio: string;
  verified: boolean;
  badge: string;
  followersCount: number;
  followingCount: number;
  currentStreak: number;
  longestStreak: number;
  isPrivate: boolean;
  posts: PublicProfilePost[];
}

async function fetchUncached(uid: string): Promise<PublicProfile | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const fdb = app.firestore();
    const [pubSnap, rootSnap] = await Promise.all([
      fdb.doc(`users/${uid}/public/profile`).get(),
      fdb.doc(`users/${uid}`).get(),
    ]);
    if (!pubSnap.exists && !rootSnap.exists) return null;

    const pub = (pubSnap.exists ? pubSnap.data() : {}) as Record<string, any>;
    const root = (rootSnap.exists ? rootSnap.data() : {}) as Record<string, any>;
    const isPrivate = !!(root.isPrivate ?? pub.isPrivate ?? false);

    let posts: PublicProfilePost[] = [];
    if (!isPrivate) {
      try {
        // where-only (single-field index, no composite needed); sort/slice in code.
        const ps = await fdb.collection("posts").where("authorId", "==", uid).limit(40).get();
        posts = ps.docs
          .map((d): Record<string, any> => ({ id: d.id, ...(d.data() as Record<string, any>) }))
          .filter((p) => p.mediaUrl && !p.isStory && p.status !== "scheduled")
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
          .slice(0, 9)
          .map((p) => ({
            id: p.id,
            mediaUrl: String(p.mediaUrl),
            caption: String(p.caption || ""),
            isVideo: !!(p.isVideoReel || p.isVideo),
          }));
      } catch { posts = []; }
    }

    return {
      uid,
      displayName: String(pub.displayName || root.displayName || pub.username || "Felcin athlete"),
      username: String(pub.username || root.username || ""),
      photoURL: String(pub.photoURL || root.photoURL || ""),
      bio: String(pub.bio || root.bio || ""),
      verified: !!(pub.verified ?? root.verified),
      badge: String(pub.badge || root.badge || ""),
      followersCount: Number(root.followersCount ?? pub.followersCount ?? 0),
      followingCount: Number(root.followingCount ?? pub.followingCount ?? 0),
      currentStreak: Number(pub.currentStreak ?? 0),
      longestStreak: Number(pub.longestStreak ?? 0),
      isPrivate,
      posts,
    };
  } catch {
    return null;
  }
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  if (IS_CAP_BUILD || !uid || uid === "_") return null;
  return unstable_cache(() => fetchUncached(uid), ["public-profile-v1", uid], {
    revalidate: 300,
    tags: [`profile-${uid}`],
  })();
}

/** Lightweight list of indexable (public, non-private) user ids for the sitemap. */
export async function listPublicProfileUids(max = 500): Promise<string[]> {
  if (IS_CAP_BUILD) return [];
  const app = getAdminApp();
  if (!app) return [];
  try {
    const fdb = app.firestore();
    let docs;
    try {
      docs = (await fdb.collection("users").orderBy("followersCount", "desc").limit(max).get()).docs;
    } catch {
      docs = (await fdb.collection("users").limit(max).get()).docs;
    }
    return docs
      .filter((d) => !(d.data() as Record<string, any>).isPrivate)
      .map((d) => d.id);
  } catch {
    return [];
  }
}
