"use client";

import FelcinLogo from "./FelcinLogo";

export default function OutageScreen({ showReload = false }: { showReload?: boolean }) {
  return (
    <>
      <style>{`
        @keyframes _felcin-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.82); }
        }
        @keyframes _felcin-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#090909",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "env(safe-area-inset-top, 24px) 24px env(safe-area-inset-bottom, 24px)",
        textAlign: "center",
        animation: "_felcin-fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both",
      }}>

        {/* Logo */}
        <div style={{ marginBottom: 36, opacity: 0.88 }}>
          <FelcinLogo size={54} />
        </div>

        {/* Status pill */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 28,
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.18)",
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#ef4444",
            flexShrink: 0,
            animation: "_felcin-pulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#ef4444",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Incident in progress
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#f2f2f2",
          margin: "0 0 12px",
          lineHeight: 1.25,
          maxWidth: 300,
        }}>
          We&apos;re experiencing a critical issue
        </h1>

        {/* Body */}
        <p style={{
          fontSize: 14,
          color: "#555",
          margin: "0 0 40px",
          lineHeight: 1.65,
          maxWidth: 270,
        }}>
          Our team is already on it. Felcin will be back shortly — we appreciate your patience.
        </p>

        {/* Divider */}
        <div style={{
          width: 28,
          height: 1,
          background: "rgba(255,255,255,0.06)",
          marginBottom: 20,
        }} />

        <span style={{ fontSize: 12, color: "#333", letterSpacing: "0.02em" }}>felcin.com</span>

        {showReload && (
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 28,
              padding: "11px 30px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "#888",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
          >
            Try reloading
          </button>
        )}
      </div>
    </>
  );
}
