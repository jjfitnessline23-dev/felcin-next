import type { Metadata } from "next";
import Link from "next/link";
import { getPublicProfile, type PublicProfile } from "@/lib/publicProfile";

// Export-build placeholder so `output: export` (Capacitor) has one param to emit.
// On the web build, all other /u/<uid> pages are server-rendered on demand.
export async function generateStaticParams() { return [{ uid: "_" }]; }

const BASE = "https://www.felcin.com";
const APP_ID = "6763660775";

export async function generateMetadata({ params }: { params: Promise<{ uid: string }> }): Promise<Metadata> {
  const { uid } = await params;
  const p = await getPublicProfile(uid);
  if (!p) return { title: "Felcin", robots: { index: false, follow: false } };

  const name = p.displayName;
  const handle = p.username ? ` (@${p.username})` : "";
  const title = `${name}${handle} — Felcin`;
  const description = p.bio || `Follow ${name} on Felcin — workouts, runs, PRs and fitness progress.`;
  const url = `${BASE}/u/${uid}`;
  const images = p.photoURL ? [{ url: p.photoURL, width: 400, height: 400, alt: name }] : [];

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: p.isPrivate
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: { title: `${name} on Felcin`, description, url, type: "profile", images },
    twitter: { card: "summary", title: `${name} on Felcin`, description, images: p.photoURL ? [p.photoURL] : [] },
    other: { "apple-itunes-app": `app-id=${APP_ID}, app-argument=${BASE}/user-profile?uid=${uid}` },
  };
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#f2f2f2", lineHeight: 1 }}>{n.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: "#666", fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function JoinCta({ uid, label }: { uid: string; label: string }) {
  return (
    <Link
      href={`/login?ref=${uid}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "13px 22px", borderRadius: 999, background: "#fff", color: "#000",
        fontSize: 15, fontWeight: 800, textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}

export default async function PublicProfilePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const p: PublicProfile | null = await getPublicProfile(uid);

  // Not found / unavailable (also the export-build "_" placeholder) — soft page, noindex.
  if (!p) {
    return (
      <main style={{ minHeight: "100dvh", background: "#090909", color: "#f2f2f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <img src="/static/logo-nav.svg" alt="Felcin" width={56} height={56} style={{ marginBottom: 18, opacity: 0.9 }} />
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Profile unavailable</h1>
        <p style={{ color: "#777", fontSize: 14, marginBottom: 24, maxWidth: 320 }}>This Felcin profile can’t be shown. It may be private or no longer exist.</p>
        <JoinCta uid={uid} label="Join Felcin" />
      </main>
    );
  }

  const name = p.displayName;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    dateModified: new Date().toISOString(),
    mainEntity: {
      "@type": "Person",
      name,
      ...(p.username ? { alternateName: `@${p.username}` } : {}),
      ...(p.bio ? { description: p.bio } : {}),
      ...(p.photoURL ? { image: p.photoURL } : {}),
      url: `${BASE}/u/${uid}`,
    },
  };

  return (
    <main style={{ minHeight: "100dvh", background: "#090909", color: "#f2f2f2" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Top bar */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <img src="/static/logo-nav.svg" alt="Felcin" width={26} height={26} />
          <span style={{ fontSize: 18, fontWeight: 800, color: "#f2f2f2", letterSpacing: -0.3 }}>Felcin</span>
        </Link>
        <Link href={`/login?ref=${uid}`} style={{ fontSize: 13, fontWeight: 700, color: "#000", background: "#fff", padding: "7px 16px", borderRadius: 999, textDecoration: "none" }}>Log in</Link>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          {p.photoURL
            ? <img src={p.photoURL} alt={name} width={84} height={84} style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }} />
            : <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, color: "#666", flexShrink: 0 }}>{name.charAt(0).toUpperCase()}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              {name}
              {p.verified && <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#3b82f6", fontVariationSettings: "'FILL' 1" }}>verified</span>}
            </h1>
            {p.username && <p style={{ color: "#666", fontSize: 14, margin: "2px 0 0" }}>@{p.username}</p>}
          </div>
        </div>

        {p.bio && <p style={{ color: "#bbb", fontSize: 14, lineHeight: 1.55, marginBottom: 18, whiteSpace: "pre-wrap" }}>{p.bio}</p>}

        {/* Stats */}
        <div style={{ display: "flex", gap: 28, marginBottom: 18 }}>
          <Stat n={p.posts.length} label="Posts" />
          <Stat n={p.followersCount} label="Followers" />
          <Stat n={p.followingCount} label="Following" />
        </div>

        {/* Streak */}
        {p.currentStreak > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 14, background: "rgba(255,122,26,0.08)", border: "1px solid rgba(255,122,26,0.22)", marginBottom: 22 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ff7a1a", fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#ff7a1a" }}>
              {p.currentStreak}-day workout streak
              {p.longestStreak > p.currentStreak && <span style={{ color: "#777", fontWeight: 600 }}> · best {p.longestStreak}</span>}
            </span>
          </div>
        )}

        {p.isPrivate ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#111", borderRadius: 18, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#555" }}>lock</span>
            <p style={{ color: "#888", fontSize: 14, margin: "10px 0 20px" }}>This account is private. Join Felcin to follow {name}.</p>
            <JoinCta uid={uid} label="Join Felcin" />
          </div>
        ) : (
          <>
            {/* Posts grid */}
            {p.posts.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginBottom: 28 }}>
                {p.posts.map((post) => (
                  <Link key={post.id} href={`/login?ref=${uid}`} style={{ position: "relative", aspectRatio: "1", background: "#111", borderRadius: 4, overflow: "hidden", display: "block" }}>
                    <img src={post.mediaUrl} alt={post.caption || `Post by ${name} on Felcin`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {post.isVideo && <span className="material-symbols-outlined" style={{ position: "absolute", top: 6, right: 6, fontSize: 16, color: "#fff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))", fontVariationSettings: "'FILL' 1" }}>play_arrow</span>}
                  </Link>
                ))}
              </div>
            )}

            {/* Conversion CTA */}
            <div style={{ textAlign: "center", padding: "28px 20px", background: "linear-gradient(135deg,#0c0618,#130a24)", borderRadius: 20, border: "1px solid rgba(167,139,250,0.18)" }}>
              <h2 style={{ fontSize: 19, fontWeight: 900, marginBottom: 6 }}>Train with {name} on Felcin</h2>
              <p style={{ color: "#888", fontSize: 13, marginBottom: 18, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
                Follow their workouts, runs and PRs — and track your own. Free to join.
              </p>
              <JoinCta uid={uid} label="Join Felcin — it’s free" />
            </div>
          </>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 36, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 12, color: "#555" }}>
          <Link href="/" style={{ color: "#666", textDecoration: "none" }}>Home</Link>
          <Link href="/privacy" style={{ color: "#666", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "#666", textDecoration: "none" }}>Terms</Link>
          <span>© Felcin</span>
        </footer>
      </div>
    </main>
  );
}
