import { Suspense } from "react";
import HomeClient, { type Post } from "./HomeClient";
import { getInitialFeed } from "@/lib/feedServer";

// Server component: fetch the first page of the global feed on the server (cached
// at the edge for 30s) and hand it to the client as a seed. The moment client-side
// auth resolves, the feed paints instantly from this data — no client Firestore
// round-trip on the critical path. Degrades to [] (today's behavior) if admin
// isn't configured or the fetch fails.
export default async function HomePage() {
  let initialPosts: Post[] = [];
  try {
    initialPosts = (await getInitialFeed()) as unknown as Post[];
  } catch {
    initialPosts = [];
  }

  return (
    <Suspense fallback={null}>
      <HomeClient initialPosts={initialPosts} />
    </Suspense>
  );
}
