"use client";

import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function ProfileSettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [badge, setBadge] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setPhotoURL(user.photoURL || "");
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setDisplayName(d.displayName || user.displayName || "");
        setBio(d.bio || "");
        setPhotoURL(d.photoURL || user.photoURL || "");
        setBadge(d.badge || "");
      }
    }).catch(() => {});
  }, [user]);

  const handlePhoto = async (f: File) => {
    if (!user || uploading) return;
    setUploading(true); setStatus(null);
    try {
      const ext = f.name.split(".").pop() || "jpg";
      const storageRef = ref(storage, `uploads/avatars/${user.uid}/avatar_${Date.now()}.${ext}`);
      const task = uploadBytesResumable(storageRef, f, { contentType: f.type });
      const url: string = await new Promise((resolve, reject) => {
        task.on("state_changed", null, reject, () =>
          getDownloadURL(task.snapshot.ref).then(resolve).catch(reject)
        );
      });
      if (url) { setPhotoURL(url); setStatus({ msg: "Photo updated", ok: true }); }
    } catch { setStatus({ msg: "Upload failed", ok: false }); }
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true); setStatus(null);
    try {
      await updateProfile(user, { displayName, photoURL });
      // Write to both paths so all parts of the app can find profile data
      await setDoc(doc(db, "users", user.uid, "public", "profile"), { displayName, bio, photoURL, badge, updatedAt: new Date() }, { merge: true });
      await setDoc(doc(db, "users", user.uid), { displayName, photoURL, badge, updatedAt: new Date() }, { merge: true });
      setStatus({ msg: "Profile saved!", ok: true });
    } catch { setStatus({ msg: "Failed to save. Try again.", ok: false }); }
    setSaving(false);
  };

  const handleSignOut = async () => { await signOut(); router.push("/login"); };
  const initial = (displayName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Edit Profile</h1>
      </div>

      {/* Avatar section */}
      <div className="flex flex-col items-center mb-8">
        <button onClick={() => fileRef.current?.click()}
          className="relative cursor-pointer border-none bg-transparent p-0">
          {photoURL ? (
            <img src={photoURL} alt="" className="rounded-full object-cover" style={{ width: 88, height: 88 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-3xl font-bold"
              style={{ width: 88, height: 88, background: "#222", color: "#aaa" }}>
              {initial}
            </div>
          )}
          <div className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)" }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>photo_camera</span>
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handlePhoto(e.target.files[0]); }} />
        <p className="mt-2.5 text-sm font-medium" style={{ color: uploading ? "#444" : "#aaa" }}>
          {uploading ? "Uploading…" : "Tap to change photo"}
        </p>
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#555" }}>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#555" }}>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150} rows={3}
            className="w-full px-4 py-3 rounded-xl outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }} />
          <p className="text-xs mt-1 text-right" style={{ color: "#333" }}>{bio.length}/150</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#555" }}>Badge</label>
          <div className="flex flex-wrap gap-2">
            {["", "🔥 Lit", "⚡ Elite", "🏆 Legend", "💪 Grind", "🌟 Star"].map((b) => (
              <button key={b || "none"} onClick={() => setBadge(b)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer transition-all"
                style={{
                  background: badge === b ? "#fff" : "rgba(255,255,255,0.06)",
                  color: badge === b ? "#000" : "#888",
                  border: `1px solid ${badge === b ? "#fff" : "rgba(255,255,255,0.08)"}`,
                }}>
                {b || "None"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#555" }}>Email</label>
          <input value={user?.email || ""} disabled
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", color: "#444" }} />
        </div>

        {status && (
          <div className="px-4 py-3 rounded-xl text-sm font-medium"
            style={{
              background: status.ok ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.08)",
              color: status.ok ? "#f2f2f2" : "#f87171",
              border: `1px solid ${status.ok ? "rgba(255,255,255,0.12)" : "rgba(239,68,68,0.2)"}`,
            }}>
            {status.msg}
          </div>
        )}

        <button onClick={save} disabled={saving}
          className="w-full py-3.5 rounded-xl font-semibold text-sm text-white border-none cursor-pointer"
          style={{ background: saving ? "rgba(255,255,255,0.06)" : "#fff", color: saving ? "#444" : "#000" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

        <button onClick={handleSignOut}
          className="w-full py-3.5 rounded-xl font-semibold text-sm border-none cursor-pointer"
          style={{ background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}>
          Sign out
        </button>

        {/* Legal links */}
        <div className="flex items-center justify-center gap-5 flex-wrap pt-2 pb-4">
          <a href="/terms" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Terms of Service</a>
          <a href="/privacy" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Privacy Policy</a>
          <a href="/guidelines" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Community Guidelines</a>
        </div>
      </div>
    </div>
  );
}
