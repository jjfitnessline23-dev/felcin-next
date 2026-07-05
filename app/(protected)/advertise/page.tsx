"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

const AD_TIERS = [
  { id: "starter", label: "Starter",  price: "$29",  impressions: "10,000",  days: 7,  color: "#635bff", features: ["10,000 impressions", "7-day campaign", "Image or video", "Click tracking"] },
  { id: "growth",  label: "Growth",   price: "$79",  impressions: "35,000",  days: 14, color: "#7C3AED", popular: true, features: ["35,000 impressions", "14-day campaign", "Image or video", "Click & CTR analytics", "Priority placement"] },
  { id: "pro",     label: "Pro",      price: "$199", impressions: "100,000", days: 30, color: "#a855f7", features: ["100,000 impressions", "30-day campaign", "Image or video", "Full analytics dashboard", "Top feed placement"] },
];

interface MyAd {
  id: string; title: string; tier: string;
  impressions: number; impressionsTarget: number; clicks: number;
  status: string; expiresAt: { seconds: number }; createdAt: { seconds: number };
  mediaUrl: string; mediaType: string;
}

export default function AdvertisePage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const processedRef = useRef<string | null>(null);

  const [title, setTitle] = useState("");
  const [adBody, setAdBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tier, setTier] = useState("growth");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [myAds, setMyAds] = useState<MyAd[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "ads"), where("advertiserId", "==", user.uid), orderBy("createdAt", "desc")))
      .then((snap) => { setMyAds(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MyAd, "id">) }))); setLoadingAds(false); })
      .catch(() => setLoadingAds(false));
  }, [user]);

  useEffect(() => {
    const sessionId = searchParams.get("ad_session_id");
    if (!sessionId || !user || processedRef.current === sessionId) return;
    processedRef.current = sessionId;
    router.replace("/advertise");
    fetch(`/api/ad-verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.ok) return;
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + data.days * 86400000));
        const pub = await import("firebase/firestore").then(({ getDoc, doc }) => getDoc(doc(db, "users", user.uid, "public", "profile"))).catch(() => null);
        const profile = pub?.exists() ? pub.data() : {};
        const adDoc = await addDoc(collection(db, "ads"), {
          advertiserId: user.uid, advertiserName: profile?.displayName || user.displayName || "Advertiser",
          advertiserPhoto: profile?.photoURL || user.photoURL || "",
          title: data.title, adBody: data.adBody, mediaUrl: data.mediaUrl, mediaType: data.mediaType, linkUrl: data.linkUrl,
          tier: data.tier, impressionsTarget: data.impressions, impressions: 0, clicks: 0,
          status: "active", amountPaid: data.amountPaid, stripeSessionId: data.sessionId, expiresAt, createdAt: Timestamp.now(),
        });
        setMyAds((prev) => [{ id: adDoc.id, title: data.title, tier: data.tier, impressions: 0, impressionsTarget: data.impressions, clicks: 0, status: "active", expiresAt: { seconds: Math.floor(Date.now() / 1000 + data.days * 86400) }, createdAt: { seconds: Math.floor(Date.now() / 1000) }, mediaUrl: data.mediaUrl, mediaType: data.mediaType }, ...prev]);
        showToast("Ad is live! It will start appearing in feeds shortly.");
      }).catch(() => {});
  }, [searchParams, user, router]);

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    const ext = file.name.split(".").pop() || "bin";
    const storageRef = ref(storage, `ads/${user.uid}/${Date.now()}.${ext}`);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on("state_changed",
      (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      () => { setUploading(false); showToast("Upload failed — try again"); },
      async () => { const url = await getDownloadURL(task.snapshot.ref); setMediaUrl(url); setUploading(false); setUploadPct(0); }
    );
  };

  const handleSubmit = async () => {
    if (!user || submitting) return;
    if (!title.trim()) { showToast("Add a title for your ad"); return; }
    if (!mediaUrl) { showToast("Upload an image or video first"); return; }
    if (!linkUrl.trim()) { showToast("Add a link URL"); return; }
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ad-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, title: title.trim(), adBody: adBody.trim(), mediaUrl, mediaType, linkUrl: linkUrl.trim(), token }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else { showToast(data.error || "Something went wrong"); setSubmitting(false); }
    } catch { showToast("Something went wrong"); setSubmitting(false); }
  };

  const selectedTier = AD_TIERS.find(t => t.id === tier)!;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", paddingBottom: 80 }}>
      {toast && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 50, padding: "10px 20px", borderRadius: 50, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", background: "rgba(20,20,20,0.97)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}

      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", padding: "48px 24px 36px", textAlign: "center", background: "linear-gradient(180deg, rgba(124,58,237,0.12) 0%, transparent 100%)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.2) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.01) 3px, rgba(255,255,255,0.01) 4px)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>ads_click</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f2f2f2", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Advertise on Felcin</h1>
          <p style={{ fontSize: 14, color: "#555", margin: 0 }}>Reach thousands of fitness users in their feed</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 20 }}>
            {[{ icon: "group", label: "Real Users" }, { icon: "trending_up", label: "Live Analytics" }, { icon: "verified", label: "Brand Safe" }].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#7C3AED", fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Tiers */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#444", marginBottom: 12 }}>SELECT A PLAN</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {AD_TIERS.map((t) => (
              <button key={t.id} onClick={() => setTier(t.id)} style={{
                width: "100%", textAlign: "left", padding: "16px", borderRadius: 18, cursor: "pointer", position: "relative", outline: "none",
                background: tier === t.id ? `rgba(124,58,237,0.08)` : "#0e0e0e",
                border: `1px solid ${tier === t.id ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)"}`,
                boxShadow: tier === t.id ? "0 0 0 1px rgba(124,58,237,0.2)" : "none",
              }}>
                {t.popular && (
                  <span style={{ position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", padding: "3px 9px", borderRadius: 50, background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>POPULAR</span>
                )}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${t.color}18`, border: `1px solid ${t.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: t.color, fontVariationSettings: "'FILL' 1" }}>campaign</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "#f2f2f2", margin: 0 }}>{t.label}</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: tier === t.id ? "#a78bfa" : "#f2f2f2", margin: 0 }}>{t.price}</p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                      {t.features.map(f => (
                        <span key={f} style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: tier === t.id ? "#7C3AED" : "#333", display: "inline-block" }} />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ad Creative */}
        <div style={{ borderRadius: 18, padding: 16, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#444", marginBottom: 14 }}>AD CREATIVE</p>

          {/* Media */}
          <p style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>Image or Video</p>
          {mediaUrl ? (
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 14, aspectRatio: "16/9" }}>
              {mediaType === "video"
                ? <video src={mediaUrl} muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <img src={mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              }
              <button onClick={() => { setMediaUrl(""); setUploadPct(0); }} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fff" }}>close</span>
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} style={{ width: "100%", borderRadius: 12, minHeight: 120, background: "rgba(124,58,237,0.04)", border: "1px dashed rgba(124,58,237,0.2)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
              {uploading ? (
                <>
                  <div className="spinner" />
                  <p style={{ fontSize: 12, color: "#555", margin: 0 }}>Uploading {uploadPct}%</p>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#7C3AED" }}>add_photo_alternate</span>
                  <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Upload image or video</p>
                  <p style={{ fontSize: 11, color: "#333", margin: 0 }}>JPG, PNG, MP4 supported</p>
                </>
              )}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

          <input type="text" placeholder="Ad headline (required)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box" }} />

          <textarea placeholder="Short description (optional)" value={adBody} onChange={(e) => setAdBody(e.target.value)} maxLength={200} rows={2}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 14, outline: "none", resize: "none", marginBottom: 10, boxSizing: "border-box" }} />

          <input type="url" placeholder="Destination URL (e.g. https://yoursite.com)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={300}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>

        {/* Summary + CTA */}
        <div style={{ borderRadius: 18, padding: 16, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 13, color: "#a78bfa", fontWeight: 700, margin: "0 0 2px" }}>{selectedTier.label} Plan</p>
              <p style={{ fontSize: 12, color: "#555", margin: 0 }}>{selectedTier.impressions} impressions · {selectedTier.days} days</p>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#f2f2f2", margin: 0 }}>{selectedTier.price}</p>
          </div>
          <button onClick={handleSubmit} disabled={submitting || uploading} style={{
            width: "100%", padding: "14px 0", borderRadius: 14, fontWeight: 800, fontSize: 14, border: "none", cursor: submitting ? "default" : "pointer",
            background: submitting ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #7C3AED, #a855f7)",
            color: submitting ? "#555" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.02em",
          }}>
            {submitting
              ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Opening checkout…</>
              : <><span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>rocket_launch</span> Launch Campaign — {selectedTier.price}</>
            }
          </button>
        </div>

        {/* My Campaigns */}
        {(loadingAds || myAds.length > 0) && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#444", marginBottom: 12 }}>YOUR CAMPAIGNS</p>
            {loadingAds ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><div className="spinner" /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {myAds.map((ad) => {
                  const pct = ad.impressionsTarget > 0 ? Math.min(100, Math.round((ad.impressions / ad.impressionsTarget) * 100)) : 0;
                  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={ad.id} style={{ borderRadius: 18, padding: 16, background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                          {ad.mediaType === "video"
                            ? <video src={ad.mediaUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <img src={ad.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "#f2f2f2", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.title}</p>
                          <p style={{ fontSize: 12, color: "#555", margin: "0 0 8px", textTransform: "capitalize" }}>{ad.tier} · expires {new Date(ad.expiresAt.seconds * 1000).toLocaleDateString()}</p>
                        </div>
                        <div style={{ padding: "4px 10px", borderRadius: 50, fontSize: 11, fontWeight: 700, background: ad.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)", color: ad.status === "active" ? "#22c55e" : "#555", border: `1px solid ${ad.status === "active" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                          {ad.status === "active" ? "● Live" : "Ended"}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: "#555" }}>Impressions</span>
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{ad.impressions.toLocaleString()} / {ad.impressionsTarget.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 50, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 50, width: `${pct}%`, background: "linear-gradient(90deg, #7C3AED, #a855f7)", transition: "width 0.5s" }} />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { label: "Clicks", value: ad.clicks.toLocaleString() },
                          { label: "CTR", value: `${ctr}%` },
                        ].map((stat) => (
                          <div key={stat.label} style={{ borderRadius: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)" }}>
                            <p style={{ fontSize: 11, color: "#555", margin: "0 0 3px" }}>{stat.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 800, color: "#f2f2f2", margin: 0 }}>{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
