import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  // Type errors now fail the build (safety net ON). The codebase is fully
  // type-clean via the typed Firestore shim in lib/db.ts — keep it that way.
  typescript: { ignoreBuildErrors: false },
  ...(isCapacitorBuild ? { output: "export", trailingSlash: true } : {}),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    unoptimized: true,
  },
  ...(isCapacitorBuild ? {} : {
    async headers() {
      return [
        // Security headers on everything (deliberately no Cache-Control here, so it
        // never clobbers the per-route / per-asset caching defined below).
        {
          source: "/:path*",
          headers: [
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          ],
        },
        // HTML documents only: keep them fresh after every deploy (revalidate), but
        // EXCLUDE api routes, _next, and any file with an extension — so their own
        // caching (e.g. the 1-day media-proxy cache) actually takes effect instead
        // of being overridden by a blanket no-cache.
        {
          source: "/((?!api|_next|.*\\..*).*)",
          headers: [
            { key: "Cache-Control", value: "no-cache" },
          ],
        },
        // Immutable build assets — cache forever.
        {
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ],
        },
        // Public static assets (logos, /static/* scripts) — cache a day, then serve
        // stale while revalidating in the background.
        {
          source: "/static/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          ],
        },
        {
          source: "/.well-known/apple-app-site-association",
          headers: [
            { key: "Content-Type", value: "application/json" },
            { key: "Cache-Control", value: "no-cache" },
          ],
        },
      ];
    },
  }),
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "felcin",
  project: "felcin-next",
});
