"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface ProgressPhoto {
  id: string;
  photoUrl: string;
  storagePath: string;
  date: string;
  weight?: number;
  notes?: string;
  createdAt?: { seconds: number };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

export default function ProgressPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"compare" | "timeline" | "add">("compare");
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  /* Compare state */
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  /* Upload state */
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Load photos */
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, "users", user.uid, "progressPhotos"), orderBy("date", "asc")),
      (snap) => {
        setPhotos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProgressPhoto, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  /* Auto-select first as before, last as after */
  useEffect(() => {
    if (photos.length >= 2 && !beforeId && !afterId) {
      setBeforeId(photos[0].id);
      setAfterId(photos[photos.length - 1].id);
    }
  }, [photos.length]); // eslint-disable-line

  /* Comparison slider */
  const handleSliderMove = (clientX: number) => {
    if (!compareRef.current) return;
    const rect = compareRef.current.getBoundingClientRect();
    const pos = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => { if (dragging) handleSliderMove(e.clientX); };
  const handleTouchMove = (e: React.TouchEvent) => { if (dragging) handleSliderMove(e.touches[0].clientX); };

  /* File pick */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* Upload */
  const handleUpload = async () => {
    if (!user || !uploadFile || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const path = `uploads/progress/${user.uid}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, uploadFile);
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject, resolve
        );
      });
      const photoUrl = await getDownloadURL(storageRef);
      const docRef = await addDoc(collection(db, "users", user.uid, "progressPhotos"), {
        photoUrl,
        storagePath: path,
        date,
        weight: weight ? parseFloat(weight) : null,
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
      });
      // Auto-assign if first or update after
      setPhotos((prev) => {
        const newPhoto = { id: docRef.id, photoUrl, storagePath: path, date, weight: weight ? parseFloat(weight) : undefined, notes: notes.trim() || undefined };
        const updated = [...prev, newPhoto].sort((a, b) => a.date.localeCompare(b.date));
        return updated;
      });
      setUploadFile(null); setPreview(null); setWeight(""); setNotes(""); setDate(new Date().toISOString().split("T")[0]);
      setTab("compare");
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  /* Delete */
  const handleDelete = async (photo: ProgressPhoto) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "progressPhotos", photo.id)).catch(() => {});
    if (photo.storagePath) deleteObject(ref(storage, photo.storagePath)).catch(() => {});
    if (beforeId === photo.id) setBeforeId(null);
    if (afterId === photo.id) setAfterId(null);
  };

  const beforePhoto = photos.find((p) => p.id === beforeId);
  const afterPhoto = photos.find((p) => p.id === afterId);

  return (
    <div className="max-w-xl mx-auto pb-10 overflow-x-hidden">
      <PageHeader title="Progress" />

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0c0618 0%,#130a24 50%,#0c0618 100%)", border: "1px solid rgba(167,139,250,0.22)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.22) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>compare</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>PROGRESS TRACKER</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Before & After</h1>
          <p className="text-sm" style={{ color: "#555" }}>Track your transformation with progress photos</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{photos.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>photos</span></div>
              {photos.length >= 2 && (<>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)" }} />
                <div><span className="text-base font-black" style={{ color: "#a78bfa" }}>{photos.length > 0 && photos[photos.length-1].weight ? `${photos[photos.length-1].weight}kg` : "—"}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>latest weight</span></div>
              </>)}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex mx-4 mb-4 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["compare","timeline","add"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer capitalize"
            style={{ background: tab === t ? "#a78bfa" : "transparent", color: tab === t ? "#000" : "#555" }}>
            {t === "compare" ? "Compare" : t === "timeline" ? "Timeline" : "＋ Add Photo"}
          </button>
        ))}
      </div>

      <div className="px-4">

        {/* ════════════════════════
            COMPARE TAB
        ════════════════════════ */}
        {tab === "compare" && (
          loading ? (
            <div className="ghost-bg flex justify-center py-24 rounded-3xl"><div className="spinner" /></div>
          ) : photos.length < 2 ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>compare</span>
              </div>
              <p className="font-bold mb-2" style={{ color: "#f2f2f2" }}>Add at least 2 photos</p>
              <p className="text-sm mb-5" style={{ color: "#555" }}>Upload your first progress photos to compare your transformation</p>
              <button onClick={() => setTab("add")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg,#7C3AED,#a78bfa)", color: "#fff", boxShadow: "0 0 20px rgba(124,58,237,0.35)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_a_photo</span>
                Add First Photo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* Selector row */}
              <div className="grid grid-cols-2 gap-3">
                {(["before","after"] as const).map((side) => {
                  const selected = side === "before" ? beforePhoto : afterPhoto;
                  const selectedId = side === "before" ? beforeId : afterId;
                  const sideColor = side === "before" ? "#60a5fa" : "#22c55e";
                  return (
                    <div key={side}>
                      <p className="text-[10px] font-black tracking-widest mb-1.5 px-1" style={{ color: sideColor }}>
                        {side.toUpperCase()}
                      </p>
                      <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "3/4", background: "#111", border: `1px solid ${selectedId ? sideColor + "40" : "rgba(255,255,255,0.08)"}` }}>
                        {selected ? (
                          <img src={selected.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#333" }}>person</span>
                          </div>
                        )}
                        {selected && (
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
                            <p className="text-xs font-semibold truncate" style={{ color: "#f2f2f2" }}>{formatDate(selected.date)}</p>
                            {selected.weight && <p className="text-[10px]" style={{ color: "#888" }}>{selected.weight}kg</p>}
                          </div>
                        )}
                      </div>
                      {/* Photo picker */}
                      <div className="flex gap-1 mt-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                        {photos.map((p) => (
                          <button key={p.id} onClick={() => side === "before" ? setBeforeId(p.id) : setAfterId(p.id)}
                            className="shrink-0 rounded-xl overflow-hidden border-none cursor-pointer"
                            style={{ width: 40, height: 40, border: `2px solid ${p.id === selectedId ? sideColor : "transparent"}`, opacity: p.id === selectedId ? 1 : 0.5 }}>
                            <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Slider comparison */}
              {beforePhoto && afterPhoto && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-black tracking-widest" style={{ color: "#444" }}>DRAG TO COMPARE</p>
                  <div
                    ref={compareRef}
                    className="relative rounded-2xl overflow-hidden select-none"
                    style={{ aspectRatio: "3/4", background: "#111", cursor: "ew-resize", touchAction: "none" }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={() => setDragging(false)}
                    onMouseLeave={() => setDragging(false)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={() => setDragging(false)}>

                    {/* After (right — full width, clipped on left) */}
                    <img src={afterPhoto.photoUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />

                    {/* Before (left — clipped on right) */}
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                      <img src={beforePhoto.photoUrl} alt="Before" className="absolute inset-0 h-full object-cover" style={{ width: `${10000 / sliderPos}%`, maxWidth: "none" }} />
                    </div>

                    {/* Divider */}
                    <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${sliderPos}%`, background: "#fff", transform: "translateX(-50%)" }}>
                      {/* Handle */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full flex items-center justify-center cursor-ew-resize"
                        style={{ background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}
                        onMouseDown={() => setDragging(true)}
                        onTouchStart={() => setDragging(true)}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="#000">
                          <path d="M5 8l-3-3v6l3-3zm6 0l3-3v6l-3-3z"/>
                        </svg>
                      </div>
                    </div>

                    {/* Labels */}
                    <div className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(96,165,250,0.85)", color: "#000" }}>BEFORE</div>
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(34,197,94,0.85)", color: "#000" }}>AFTER</div>
                  </div>

                  {/* Stats comparison */}
                  {(beforePhoto.weight || afterPhoto.weight) && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-2xl text-center" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                        <p className="text-xs mb-1" style={{ color: "#60a5fa" }}>Before</p>
                        <p className="text-lg font-black" style={{ color: "#f2f2f2" }}>{beforePhoto.weight ? `${beforePhoto.weight}kg` : "—"}</p>
                      </div>
                      <div className="p-3 rounded-2xl text-center" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
                        <p className="text-xs mb-1" style={{ color: "#a78bfa" }}>Change</p>
                        <p className="text-lg font-black" style={{ color: beforePhoto.weight && afterPhoto.weight ? (afterPhoto.weight < beforePhoto.weight ? "#22c55e" : "#ef4444") : "#555" }}>
                          {beforePhoto.weight && afterPhoto.weight
                            ? `${afterPhoto.weight - beforePhoto.weight > 0 ? "+" : ""}${(afterPhoto.weight - beforePhoto.weight).toFixed(1)}kg`
                            : "—"}
                        </p>
                      </div>
                      <div className="p-3 rounded-2xl text-center" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                        <p className="text-xs mb-1" style={{ color: "#22c55e" }}>After</p>
                        <p className="text-lg font-black" style={{ color: "#f2f2f2" }}>{afterPhoto.weight ? `${afterPhoto.weight}kg` : "—"}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {/* ════════════════════════
            TIMELINE TAB
        ════════════════════════ */}
        {tab === "timeline" && (
          loading ? (
            <div className="ghost-bg flex justify-center py-24 rounded-3xl"><div className="spinner" /></div>
          ) : photos.length === 0 ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#2a2a2a", display: "block", marginBottom: 12 }}>photo_library</span>
              <p className="font-bold mb-2" style={{ color: "#f2f2f2" }}>No photos yet</p>
              <p className="text-sm mb-5" style={{ color: "#555" }}>Start tracking your transformation</p>
              <button onClick={() => setTab("add")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg,#7C3AED,#a78bfa)", color: "#fff" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_a_photo</span>
                Add First Photo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-black tracking-widest mb-1" style={{ color: "#444" }}>YOUR TRANSFORMATION TIMELINE</p>
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p, i) => (
                  <div key={p.id} className="rounded-2xl overflow-hidden relative group"
                    style={{ background: "#111", border: "1px solid rgba(167,139,250,0.15)" }}>
                    <div style={{ aspectRatio: "3/4" }}>
                      <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                    {/* Info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-2.5" style={{ background: "linear-gradient(0deg,rgba(0,0,0,0.85),transparent)" }}>
                      <p className="text-xs font-bold" style={{ color: "#f2f2f2" }}>{formatDate(p.date)}</p>
                      {p.weight && <p className="text-[10px]" style={{ color: "#888" }}>{p.weight} kg</p>}
                      {p.notes && <p className="text-[10px] truncate mt-0.5" style={{ color: "#666" }}>{p.notes}</p>}
                    </div>
                    {/* Photo number badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black"
                      style={{ background: "rgba(167,139,250,0.85)", color: "#fff" }}>#{i + 1}</div>
                    {/* Delete button */}
                    <button onClick={() => handleDelete(p)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(239,68,68,0.85)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#fff" }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setTab("add")}
                className="btn-glass w-full py-3 rounded-2xl text-sm font-bold border-none cursor-pointer flex items-center justify-center gap-2 mt-2"
                style={{ color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_a_photo</span>
                Add Another Photo
              </button>
            </div>
          )
        )}

        {/* ════════════════════════
            ADD PHOTO TAB
        ════════════════════════ */}
        {tab === "add" && (
          <div className="flex flex-col gap-4">
            {/* Photo picker */}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()}
              className="relative rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ aspectRatio: "3/4", background: preview ? "transparent" : "#0f0f0f", border: `2px dashed ${preview ? "rgba(167,139,250,0.6)" : "rgba(167,139,250,0.25)"}`, cursor: "pointer" }}>
              {preview ? (
                <img src={preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>add_a_photo</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: "#a78bfa" }}>Tap to add photo</p>
                  <p className="text-xs" style={{ color: "#555" }}>Camera or gallery</p>
                </div>
              )}
              {preview && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.5)" }}>
                  <p className="text-sm font-bold text-white">Tap to change</p>
                </div>
              )}
            </button>

            {/* Form fields */}
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-bold mb-1.5" style={{ color: "#555" }}>DATE</p>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", colorScheme: "dark" }} />
              </div>
              <div>
                <p className="text-xs font-bold mb-1.5" style={{ color: "#555" }}>WEIGHT (kg) — optional</p>
                <input type="number" placeholder="e.g. 82.5" value={weight} onChange={(e) => setWeight(e.target.value)} min={0} step={0.1}
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              </div>
              <div>
                <p className="text-xs font-bold mb-1.5" style={{ color: "#555" }}>NOTES — optional</p>
                <textarea placeholder="How are you feeling? Any measurements?" value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3} maxLength={300}
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm resize-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
              </div>
            </div>

            {/* Upload progress */}
            {uploading && (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "#666" }}>
                  <span>Uploading…</span><span>{uploadProgress}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(167,139,250,0.1)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg,#7C3AED,#a78bfa)" }} />
                </div>
              </div>
            )}

            <button onClick={handleUpload} disabled={!uploadFile || uploading}
              className="w-full py-4 rounded-2xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
              style={{
                background: uploadFile && !uploading ? "linear-gradient(135deg,#7C3AED,#a78bfa)" : "rgba(255,255,255,0.06)",
                color: uploadFile && !uploading ? "#fff" : "#444",
                boxShadow: uploadFile && !uploading ? "0 0 24px rgba(124,58,237,0.35)" : "none",
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>cloud_upload</span>
              {uploading ? "Uploading…" : "Save Progress Photo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
