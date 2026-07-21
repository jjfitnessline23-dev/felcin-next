import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  ...(isCapacitorBuild ? { output: "export", trailingSlash: true } : {}),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    unoptimized: true,
  },
  ...(isCapacitorBuild ? {} : {
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
            { key: "Cache-Control", value: "no-cache" },
          ],
        },
        {
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ],
        },
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" },
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
