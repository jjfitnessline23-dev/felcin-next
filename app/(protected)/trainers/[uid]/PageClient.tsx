"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "@/lib/db";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface TrainerProfile {
  displayName: string;
  photoURL?: string;
  bio?: string;
  specialty?: string[];
  ratePerSession?: number;
  sessionCount?: number;
  isActive?: boolean;
}

export default function TrainerProfileClient() {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [trainer, setTrainer] = useState<TrainerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState("");

  useEffect(() => {
    if (!uid || uid === "_") return;
    getDoc(doc(db, "trainerProfiles", uid))
      .then((snap) => { if (snap.exists()) setTrainer(snap.data() as TrainerProfile); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [uid]);

  const handleBook = async () => {
    if (!user || !selectedDate || booking) return;
    setBooking(true);
    setBookError("");
    try {
      const token = await auth.currentUser?.getIdToken(); if (!token) throw new Error("no token");
      const sessionDate = `${selectedDate}T${selectedTime}:00`;
      const res = await fetch("/api/training-session-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId: uid, sessionDate, token, returnUrl: `${window.location.origin}/training-sessions` }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else setBookError(data.error || "Booking failed");
    } catch {
      setBookError("Something went wrong");
    }
    setBooking(false);
  };

  const today = new Date().toISOString().split("T")[0];

  if (loading) return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Trainer Profile" />
      <div className="flex justify-center py-20"><div className="spinner" /></div>
    </div>
  );

  if (!trainer) return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Trainer Profile" />
      <p className="text-center py-20 text-sm" style={{ color: "#555" }}>Trainer not found</p>
    </div>
  );

  const isOwnProfile = user?.uid === uid;

  return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Trainer Profile" />

      {/* Hero */}
      <div className="mx-4 mt-4 p-5 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-4 mb-4">
          {trainer.photoURL ? (
            <img src={trainer.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 72, height: 72 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
              style={{ width: 72, height: 72, background: "#222", color: "#888" }}>
              {(trainer.displayName || "T").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold" style={{ color: "#f2f2f2" }}>{trainer.displayName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                Certified Trainer
              </span>
              {trainer.sessionCount ? (
                <span className="text-xs" style={{ color: "#555" }}>{trainer.sessionCount} sessions</span>
              ) : null}
            </div>
          </div>
        </div>

        {trainer.bio && (
          <p className="text-sm mb-4" style={{ color: "#999", lineHeight: 1.6 }}>{trainer.bio}</p>
        )}

        {(trainer.specialty || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(trainer.specialty || []).map((s) => (
              <span key={s} className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
                style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>
              {trainer.ratePerSession ? `$${(trainer.ratePerSession / 100).toFixed(0)}` : "Contact for rate"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>per session</p>
          </div>
          {!isOwnProfile && trainer.ratePerSession && (
            <button onClick={() => setShowBook(true)}
              className="px-5 py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
              style={{ background: "#a78bfa", color: "#000" }}>
              Book a Session
            </button>
          )}
          {isOwnProfile && (
            <button onClick={() => router.push("/trainer-dashboard")}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.07)", color: "#888" }}>
              Manage Profile
            </button>
          )}
        </div>
      </div>

      {/* Action row */}
      {!isOwnProfile && (
        <div className="mx-4 mt-3 flex gap-2">
          <button onClick={() => router.push(`/private-chats?uid=${uid}`)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.06)", color: "#aaa" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>chat</span>
            Message Trainer
          </button>
        </div>
      )}

      {/* Book session modal overlay */}
      {showBook && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-xl mx-auto rounded-t-2xl p-6"
            style={{ background: "#111", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>Book a Session</p>
              <button onClick={() => { setShowBook(false); setBookError(""); }}
                className="border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#555" }}>close</span>
              </button>
            </div>

            <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Select Date</p>
            <input type="date" min={today} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-4"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            <p className="text-sm font-semibold mb-1.5" style={{ color: "#888" }}>Preferred Time</p>
            <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-5"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />

            <div className="flex items-center justify-between p-3 rounded-xl mb-4"
              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)" }}>
              <span className="text-sm" style={{ color: "#999" }}>Session rate</span>
              <span className="text-base font-bold" style={{ color: "#a78bfa" }}>
                ${(trainer.ratePerSession! / 100).toFixed(2)}
              </span>
            </div>

            {bookError && <p className="text-xs text-center mb-3" style={{ color: "#ef4444" }}>{bookError}</p>}

            <button onClick={handleBook} disabled={!selectedDate || booking}
              className="w-full py-3.5 rounded-xl text-sm font-bold border-none cursor-pointer"
              style={{ background: selectedDate && !booking ? "#a78bfa" : "#2a2a2a", color: selectedDate && !booking ? "#000" : "#555" }}>
              {booking ? "Redirecting to payment…" : "Confirm & Pay"}
            </button>
            <p className="text-[10px] text-center mt-2.5" style={{ color: "#444" }}>
              Trainer will confirm your session after payment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
