"use client";

export function PostCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-full shrink-0 skeleton" />
        <div className="flex-1">
          <div className="h-3 rounded-full w-28 mb-2 skeleton" />
          <div className="h-2.5 rounded-full w-16 skeleton" />
        </div>
      </div>
      <div className="w-full skeleton" style={{ aspectRatio: "1/1" }} />
      <div className="p-4 flex items-center gap-2">
        <div className="h-7 w-16 rounded-full skeleton" />
        <div className="h-7 w-16 rounded-full skeleton" />
      </div>
      <div className="px-4 pb-4">
        <div className="h-3 rounded-full w-3/4 skeleton" />
      </div>
    </div>
  );
}

export function GhostCardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="w-14 h-14 rounded-2xl skeleton shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 rounded-full w-40 mb-2.5 skeleton" />
        <div className="h-2.5 rounded-full w-24 mb-2 skeleton" />
        <div className="h-2 rounded-full w-32 skeleton" />
      </div>
      <div className="w-6 h-6 rounded-full skeleton shrink-0" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="px-4 py-6">
      <div className="flex items-end gap-4 mb-5">
        <div className="w-20 h-20 rounded-full skeleton" />
        <div className="flex-1 pb-1">
          <div className="h-4 rounded-full w-36 mb-2.5 skeleton" />
          <div className="h-3 rounded-full w-24 skeleton" />
        </div>
      </div>
      <div className="h-3 rounded-full w-full mb-2 skeleton" />
      <div className="h-3 rounded-full w-2/3 skeleton" />
    </div>
  );
}
