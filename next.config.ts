import type { NextConfig } from "next";

const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild ? { output: "export", trailingSlash: true } : {}),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    unoptimized: true,
  },
  ...(isCapacitorBuild ? {} : {
    async rewrites() {
      return [
        {
          source: "/__/auth/:path*",
          destination: "https://felcin.firebaseapp.com/__/auth/:path*",
        },
      ];
    },
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
      ];
    },
  }),
};

export default nextConfig;
