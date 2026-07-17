import * as Sentry from "@sentry/nextjs";

const isCapacitor = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.01,
  // Disable replay and all integrations on Capacitor — replayIntegration starts
  // rrweb DOM monitoring on startup which adds heavy overhead in WKWebView/WebView.
  integrations: isCapacitor ? [] : [Sentry.replayIntegration()],
  enabled: !isCapacitor && process.env.NODE_ENV === "production",
});
