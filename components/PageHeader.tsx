"use client";

import { useRouter } from "next/navigation";

export default function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div
      className="sticky z-20 flex items-center gap-3 px-4 py-3 relative"
      style={{
        top: 0,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        background: "rgba(9,9,9,0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
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
      <h1 className="font-bold text-base absolute left-1/2 -translate-x-1/2 truncate" style={{ color: "#f2f2f2" }}>
        {title}
      </h1>
      {right && <div className="shrink-0 ml-auto">{right}</div>}
    </div>
  );
}
