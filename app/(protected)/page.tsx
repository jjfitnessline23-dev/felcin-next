import { Suspense } from "react";
import HomeClient, { type Post } from "./HomeClient";
import { getInitialFeed } from "@/lib/feedServer";

// Server component: fetch the first page of the global feed on the server (cached
// at the edge for 30s) and hand it to the client as a seed. The moment client-side
// auth resolves, the feed paints instantly from this data — no client Firestore
// round-trip on the critical path. Degrades to [] (today's behavior) if admin
// isn't configured or the fetch fails.
export default async function HomePage() {
  // Never let the feed fetch block the page: time-box it to 1.5s. If Firestore is slow
  // (cold start), render immediately with [] and let the client load the feed — the
  // homepage must paint fast (logged-out visitors see the marketing page, not the feed).
  let initialPosts: Post[] = [];
  try {
    const timeout = new Promise<Post[]>((resolve) => setTimeout(() => resolve([]), 1500));
    initialPosts = await Promise.race([getInitialFeed() as unknown as Promise<Post[]>, timeout]);
  } catch {
    initialPosts = [];
  }

  return (
    <Suspense fallback={null}>
      <HomeClient initialPosts={initialPosts} />
    </Suspense>
  );
}
