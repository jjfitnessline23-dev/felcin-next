"use client";
import { useRouter } from "next/navigation";

export default function BackBar({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
    }}>
      <button
        onClick={() => router.back()}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 50, padding: "6px 14px 6px 10px",
          color: "#f2f2f2", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        {label}
      </button>
    </div>
  );
}
