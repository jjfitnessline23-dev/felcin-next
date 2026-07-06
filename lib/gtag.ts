// Google Ads conversion tracking
// Usage: gtagEvent('sign_up') or gtagEvent('purchase', { value: 9.99, currency: 'USD' })

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function gtagEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", action, params);
}

// Fire this when a user completes sign-up — tracked as Google Ads conversion
export function trackSignUp() {
  gtagEvent("sign_up", { method: "felcin" });
  // If you have a specific conversion label from Google Ads:
  // gtagEvent("conversion", { send_to: "AW-XXXXXXXXXX/YYYYYYYY" });
}

// Fire this when a user makes a purchase
export function trackPurchase(valueCents: number, currency = "USD") {
  gtagEvent("purchase", {
    value: valueCents / 100,
    currency,
    transaction_id: Date.now().toString(),
  });
}
