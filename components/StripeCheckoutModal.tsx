"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Props {
  fetchClientSecret: () => Promise<string>;
  onClose: () => void;
  onComplete?: () => void;
}

export default function StripeCheckoutModal({ fetchClientSecret, onClose, onComplete }: Props) {
  const fetchFn = useCallback(fetchClientSecret, [fetchClientSecret]);

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{
          background: "#fff",
          marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
          maxHeight: "85dvh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2" style={{ background: "#fff" }}>
          <span className="text-sm font-semibold" style={{ color: "#111" }}>Secure checkout</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <span style={{ fontSize: 20, color: "#555" }}>✕</span>
          </button>
        </div>
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={{ fetchClientSecret: fetchFn, onComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
