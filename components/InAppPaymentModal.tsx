"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Props {
  clientSecret: string;
  title: string;
  subtitle?: string;
  buttonLabel: string;
  onClose: () => void;
  onSuccess: (paymentIntentId: string) => void;
}

function PaymentForm({ title, subtitle, buttonLabel, onClose, onSuccess }: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) { setError(submitError.message ?? "Invalid details"); setLoading(false); return; }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setLoading(false);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess(paymentIntent.id);
    } else {
      setError("Payment could not be completed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
      <h3 className="text-base font-bold mb-1" style={{ color: "#f2f2f2" }}>{title}</h3>
      {subtitle && <p className="text-xs mb-5" style={{ color: "#555" }}>{subtitle}</p>}
      <div className="mb-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error && <p className="text-xs mb-3" style={{ color: "#f87171" }}>{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
        style={{ background: loading ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: loading ? "#555" : "#000" }}
      >
        {loading ? "Processing…" : buttonLabel}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-2xl text-sm mt-2 border-none cursor-pointer"
        style={{ background: "transparent", color: "#555" }}
      >
        Cancel
      </button>
    </form>
  );
}

export default function InAppPaymentModal({ clientSecret, title, subtitle, buttonLabel, onClose, onSuccess }: Props) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-y-auto"
        style={{
          background: "#131313",
          border: "1px solid rgba(255,255,255,0.1)",
          maxHeight: "85dvh",
          marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
          padding: "24px 24px 28px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "night",
              variables: {
                colorBackground: "#1a1a1a",
                colorText: "#f2f2f2",
                colorTextSecondary: "#888",
                colorDanger: "#f87171",
                borderRadius: "12px",
                fontFamily: "inherit",
              },
            },
          }}
        >
          <PaymentForm
            title={title}
            subtitle={subtitle}
            buttonLabel={buttonLabel}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </Elements>
      </div>
    </div>
  );
}
