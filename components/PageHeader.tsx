"use client";

import { useRouter } from "next/navigation";

export default function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div
      className="sticky z-20 flex items-center gap-3 px-4 py-3"
      style={{
        top: "env(safe-area-inset-top,0px)",
        background: "rgba(9,9,9,0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        onClick={() => router.back()}
        className="icon-btn shrink-0"
        style={{ width: 36, height: 36 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>
          arrow_back
        </span>
      </button>
      <h1 className="font-bold text-base flex-1 truncate" style={{ color: "#f2f2f2" }}>
        {title}
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
