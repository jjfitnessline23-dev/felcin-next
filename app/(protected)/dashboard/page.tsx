"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";

const FOLLOWER_MILESTONES = [100, 300, 500, 1000, 5000, 10000, 50000];

function nextMilestone(count: number) {
  return FOLLOWER_MILESTONES.find((m) => m > count) ?? FOLLOWER_MILESTONES[FOLLOWER_MILESTONES.length - 1];
}

function prevMilestone(count: number) {
  const idx = FOLLOWER_MILESTONES.findIndex((m) => m > count);
  return idx > 0 ? FOLLOWER_MILESTONES[idx - 1] : 0;
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ posts: 0, likes: 0, comments: 0, followers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, "posts"), where("authorId", "==", user.uid))),
      getDocs(collection(db, "users", user.uid, "followers")),
    ]).then(([postsSnap, followersSnap]) => {
      const posts = postsSnap.docs.map((d) => d.data());
      setStats({
        posts: posts.length,
        likes: posts.reduce((s, p) => s + (p.likes || 0), 0),
        comments: posts.reduce((s, p) => s + (p.comments || 0), 0),
        followers: followersSnap.size,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const engagementRate = stats.posts > 0
    ? ((stats.likes + stats.comments) / stats.posts).toFixed(1)
    : "0";
  const engagementPct = stats.posts > 0
    ? Math.min(100, ((stats.likes + stats.comments) / (stats.posts * 10)) * 100)
    : 0;

  const next = nextMilestone(stats.followers);
  const prev = prevMilestone(stats.followers);
  const milestoneRange = next - prev;
  const milestoneProgress = milestoneRange > 0 ? Math.min(100, ((stats.followers - prev) / milestoneRange) * 100) : 100;

  const displayName = user?.displayName?.split(" ")[0] || "Creator";

  const statCards = [
    { label: "Posts", value: stats.posts, icon: "photo_camera", color: "#a78bfa", border: "rgba(167,139,250,0.25)", bg: "rgba(167,139,250,0.08)" },
    { label: "Total Likes", value: stats.likes, icon: "favorite", color: "#ef4444", border: "rgba(239,68,68,0.25)", bg: "rgba(239,68,68,0.08)" },
    { label: "Comments", value: stats.comments, icon: "chat_bubble", color: "#06b6d4", border: "rgba(6,182,212,0.25)", bg: "rgba(6,182,212,0.08)" },
    { label: "Followers", value: stats.followers, icon: "people", color: "#f59e0b", border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.08)" },
  ];

  const studioLinks = [
    { href: "/podcasts", label: "Podcast Studio", icon: "mic", color: "#a78bfa", desc: "Episodes & live broadcasts" },
    { href: "/live", label: "Live Studio", icon: "sensors", color: "#ef4444", desc: "Go live to your audience" },
    { href: "/creator", label: "Create", icon: "add_circle", color: "#22c55e", desc: "Post, reel, story" },
    { href: "/earnings", label: "Earnings", icon: "payments", color: "#f59e0b", desc: "Revenue & payouts" },
  ];

  return (
    <div className="max-w-xl mx-auto pb-10">
      <PageHeader title="Dashboard" />

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0a0a0a 0%,#111 50%,#0a0a0a 100%)", border: "1px solid rgba(255,255,255,0.1)", minHeight: 170 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)", animation: "scanLine 6s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-20%", left: "50%", transform: "translateX(-50%)", width: 440, height: 440, background: "radial-gradient(ellipse at center,rgba(167,139,250,0.18) 0%,rgba(245,158,11,0.06) 45%,transparent 65%)", animation: "heroGlow 5s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 170, opacity: 0.045, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.35)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>bar_chart</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.18em" }}>CREATOR DASHBOARD</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.7rem,6vw,2.4rem)", letterSpacing: -1.5, background: "linear-gradient(135deg,#fff 0%,#e0e0e0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Hey, {displayName} 👋
          </h1>
          <p className="text-sm" style={{ color: "#555" }}>Track your growth and understand your audience</p>
          {!loading && (
            <div className="flex items-center gap-5 mt-3">
              <div><span className="text-lg font-black" style={{ color: "#f59e0b" }}>{fmtNum(stats.followers)}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>followers</span></div>
              <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />
              <div><span className="text-lg font-black" style={{ color: "#a78bfa" }}>{engagementRate}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>avg interactions</span></div>
              <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />
              <div><span className="text-lg font-black" style={{ color: "#06b6d4" }}>{stats.posts}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>posts</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4">

        {loading ? (
          <div className="ghost-bg flex justify-center py-20 rounded-3xl"><div className="spinner" /></div>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {statCards.map((card) => (
                <div key={card.label} className="p-5 rounded-2xl relative overflow-hidden"
                  style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                  {/* Corner glow */}
                  <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 80, height: 80, background: `radial-gradient(circle,${card.color}30 0%,transparent 70%)`, transform: "translate(20%,-20%)" }} />
                  {/* Ghost watermark */}
                  <img src="/static/logo-nav.svg" alt="" className="absolute pointer-events-none select-none"
                    style={{ width: 70, bottom: -10, right: -10, opacity: 0.05, filter: "grayscale(1) brightness(3)" }} />
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 relative"
                    style={{ background: `${card.color}22`, border: `1px solid ${card.color}44` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: card.color, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                  </div>
                  <div className="text-3xl font-black mb-0.5 relative" style={{ color: "#f2f2f2" }}>{card.value.toLocaleString()}</div>
                  <div className="text-xs font-medium relative" style={{ color: "#666" }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* ── Engagement Rate ── */}
            <div className="p-5 rounded-2xl mb-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#0d0d1f,#131313)", border: "1px solid rgba(167,139,250,0.15)" }}>
              <img src="/static/logo-nav.svg" alt="" className="absolute pointer-events-none select-none"
                style={{ width: 100, bottom: -15, right: -15, opacity: 0.04, filter: "grayscale(1) brightness(3)" }} />
              <div className="flex items-center justify-between mb-3 relative">
                <div>
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Engagement Rate</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                    {stats.posts > 0 ? `${engagementRate} interactions per post` : "Post something to see your engagement"}
                  </p>
                </div>
                <span className="text-2xl font-black" style={{ color: "#a78bfa" }}>{engagementPct.toFixed(0)}%</span>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${engagementPct}%`, background: "linear-gradient(90deg,#7C3AED,#a78bfa)" }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px]" style={{ color: "#333" }}>0%</span>
                <span className="text-[10px]" style={{ color: "#333" }}>100%</span>
              </div>
            </div>

            {/* ── Follower Milestone ── */}
            <div className="p-5 rounded-2xl mb-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#120a00,#131313)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <img src="/static/logo-nav.svg" alt="" className="absolute pointer-events-none select-none"
                style={{ width: 100, bottom: -15, right: -15, opacity: 0.04, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(30deg)" }} />
              <div className="flex items-center justify-between mb-3 relative">
                <div>
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Follower Milestone</p>
                  <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                    {next - stats.followers > 0
                      ? `${(next - stats.followers).toLocaleString()} away from ${fmtNum(next)}`
                      : `You've hit ${fmtNum(next)}! 🎉`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black" style={{ color: "#f59e0b" }}>{fmtNum(stats.followers)}</span>
                  <span className="text-xs ml-1" style={{ color: "#555" }}>/ {fmtNum(next)}</span>
                </div>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${milestoneProgress}%`, background: "linear-gradient(90deg,#d97706,#f59e0b,#fcd34d)" }} />
              </div>
              {/* Milestone labels */}
              <div className="flex justify-between mt-2">
                <span className="text-[10px]" style={{ color: "#444" }}>{fmtNum(prev)}</span>
                {next === 300 && <span className="text-[10px]" style={{ color: "#a78bfa" }}>🎙️ Unlocks Studio</span>}
                {next === 1000 && <span className="text-[10px]" style={{ color: "#ef4444" }}>📡 Unlocks Live</span>}
                <span className="text-[10px]" style={{ color: "#444" }}>{fmtNum(next)}</span>
              </div>
            </div>

            {/* ── Content Breakdown ── */}
            {stats.posts > 0 && (
              <div className="p-5 rounded-2xl mb-4 relative overflow-hidden"
                style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-sm font-bold mb-4" style={{ color: "#f2f2f2" }}>Content Breakdown</p>
                {[
                  { label: "Likes", value: stats.likes, max: Math.max(stats.likes, stats.comments, 1), color: "#ef4444" },
                  { label: "Comments", value: stats.comments, max: Math.max(stats.likes, stats.comments, 1), color: "#06b6d4" },
                ].map((row) => (
                  <div key={row.label} className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs" style={{ color: "#666" }}>{row.label}</span>
                      <span className="text-xs font-bold" style={{ color: row.color }}>{row.value.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round((row.value / row.max) * 100)}%`, background: row.color, opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Studio Quick Links ── */}
            <p className="text-xs font-black tracking-widest mb-3" style={{ color: "#333" }}>QUICK ACCESS</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {studioLinks.map((link) => (
                <Link key={link.href} href={link.href}
                  className="btn-glass p-4 rounded-2xl flex items-center gap-3"
                  style={{ border: `1px solid rgba(255,255,255,0.08)`, textDecoration: "none" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${link.color}18`, border: `1px solid ${link.color}33` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: link.color, fontVariationSettings: "'FILL' 1" }}>{link.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: "#f2f2f2" }}>{link.label}</p>
                    <p className="text-[10px] truncate" style={{ color: "#444" }}>{link.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
