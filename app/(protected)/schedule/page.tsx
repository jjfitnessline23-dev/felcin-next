"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, getDocs, addDoc, setDoc, deleteDoc, doc, serverTimestamp, getDoc } from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface ScheduledClass {
  id: string; hostId: string; hostName: string; hostPhoto?: string;
  title: string; description?: string; scheduledAt: { seconds: number };
  type?: string; rsvpCount?: number;
}

const CLASS_TYPES = ["HIIT", "Strength", "Yoga", "Cardio", "Mobility", "Pilates", "CrossFit", "Boxing", "Stretching", "Other"];

function formatDateTime(s: number) {
  return new Date(s * 1000).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function isNearLive(s: number) { return Math.abs(Date.now() / 1000 - s) < 1800; }
function isPast(s: number) { return s * 1000 < Date.now() - 1800000; }

export default function SchedulePage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [rsvps, setRsvps] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", scheduledAt: "", type: "HIIT" });

  const isOwner = user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    getDocs(query(collection(db, "scheduledClasses"), orderBy("scheduledAt", "asc")))
      .then(async (snap) => {
        const cs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ScheduledClass, "id">) }))
          .filter((c) => !isPast(c.scheduledAt.seconds));
        setClasses(cs);
        if (user) {
          const found = new Set<string>();
          await Promise.all(cs.map(async (c) => {
            const s = await getDoc(doc(db, "scheduledClasses", c.id, "rsvps", user.uid));
            if (s.exists()) found.add(c.id);
          }));
          setRsvps(found);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  async function saveClass() {
    if (!user || !form.title.trim() || !form.scheduledAt || saving) return;
    setSaving(true);
    try {
      const scheduledAtSecs = new Date(form.scheduledAt).getTime() / 1000;
      const ref = await addDoc(collection(db, "scheduledClasses"), {
        hostId: user.uid, hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        title: form.title.trim(), description: form.description.trim() || null,
        scheduledAt: { seconds: scheduledAtSecs },
        type: form.type, rsvpCount: 0, createdAt: serverTimestamp(),
      });
      const newClass: ScheduledClass = {
        id: ref.id, hostId: user.uid, hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || undefined,
        title: form.title.trim(), description: form.description.trim() || undefined,
        scheduledAt: { seconds: scheduledAtSecs }, type: form.type, rsvpCount: 0,
      };
      setClasses((p) => [...p, newClass].sort((a, b) => a.scheduledAt.seconds - b.scheduledAt.seconds));
      setShowCreate(false); setForm({ title: "", description: "", scheduledAt: "", type: "HIIT" });
    } catch {}
    setSaving(false);
  }

  async function toggleRsvp(classId: string) {
    if (!user) return;
    const ref = doc(db, "scheduledClasses", classId, "rsvps", user.uid);
    if (rsvps.has(classId)) {
      await deleteDoc(ref).catch(() => {});
      setRsvps((p) => { const n = new Set(p); n.delete(classId); return n; });
      setClasses((p) => p.map((c) => c.id === classId ? { ...c, rsvpCount: Math.max(0, (c.rsvpCount ?? 0) - 1) } : c));
    } else {
      await setDoc(ref, { uid: user.uid, rsvpedAt: serverTimestamp() }).catch(() => {});
      setRsvps((p) => new Set([...p, classId]));
      setClasses((p) => p.map((c) => c.id === classId ? { ...c, rsvpCount: (c.rsvpCount ?? 0) + 1 } : c));
    }
  }

  return (
    <div className="max-w-xl mx-auto pb-6">
      <PageHeader title="Live Schedule" right={
        isOwner && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#ef4444", color: "#fff" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add
          </button>
        )
      } />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#120005 0%,#1c0008 50%,#120005 100%)", border: "1px solid rgba(239,68,68,0.2)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(239,68,68,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(239,68,68,0.25) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(300deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#ef4444", letterSpacing: "0.18em" }}>LIVE SCHEDULE</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fca5a5 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Live Schedule</h1>
          <p className="text-sm" style={{ color: "#555" }}>Upcoming fitness classes & live workouts</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#ef4444" }}>{classes.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>upcoming</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-2">

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : classes.length === 0 ? (
        <div className="ghost-bg text-center py-20 rounded-3xl">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#ef4444" }}>calendar_month</span>
          </div>
          <p className="text-lg font-semibold mb-1" style={{ color: "#f2f2f2" }}>No classes scheduled</p>
          <p className="text-sm" style={{ color: "#555" }}>Check back soon for upcoming live workouts</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {classes.map((c) => {
            const init = (c.hostName || "H").charAt(0).toUpperCase();
            const live = isNearLive(c.scheduledAt.seconds);
            const rsvped = rsvps.has(c.id);
            return (
              <div key={c.id} className="p-4 rounded-2xl"
                style={{ background: "#131313", border: `1px solid ${live ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}` }}>
                <div className="flex items-start gap-3 mb-3">
                  {c.hostPhoto
                    ? <img src={c.hostPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>{init}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {live && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#ef4444", color: "#fff" }}>LIVE NOW</span>}
                      {c.type && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}>{c.type}</span>}
                    </div>
                    <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{c.title}</p>
                    {c.description && <p className="text-xs mt-0.5" style={{ color: "#666" }}>{c.description}</p>}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#555" }}>schedule</span>
                        <span className="text-xs" style={{ color: "#555" }}>{formatDateTime(c.scheduledAt.seconds)}</span>
                      </div>
                      {(c.rsvpCount ?? 0) > 0 && (
                        <>
                          <span style={{ color: "#333", fontSize: 10 }}>·</span>
                          <span className="text-xs" style={{ color: "#555" }}>{c.rsvpCount} going</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {live ? (
                  <Link href="/live"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sensors</span> Join Live
                  </Link>
                ) : (
                  <button onClick={() => toggleRsvp(c.id)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                    style={{
                      background: rsvped ? "rgba(255,255,255,0.06)" : "#f2f2f2",
                      color: rsvped ? "#888" : "#000",
                      border: rsvped ? "1px solid rgba(255,255,255,0.1)" : "none",
                    }}>
                    {rsvped ? "✓ Going" : "RSVP"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)" }}>
            <p className="text-base font-bold mb-4" style={{ color: "#f2f2f2" }}>Schedule a Live Class</p>
            <input type="text" placeholder="Class title" value={form.title} maxLength={80}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <textarea placeholder="Description (optional)" value={form.description} rows={2} maxLength={300}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3 resize-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}>
              {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="datetime-local" value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-4"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", colorScheme: "dark" }} />
            <button onClick={saveClass} disabled={!form.title.trim() || !form.scheduledAt || saving}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{
                background: (!form.title.trim() || !form.scheduledAt || saving) ? "rgba(255,255,255,0.08)" : "#ef4444",
                color: (!form.title.trim() || !form.scheduledAt || saving) ? "#444" : "#fff",
              }}>
              {saving ? "Scheduling…" : "Schedule Class"}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
