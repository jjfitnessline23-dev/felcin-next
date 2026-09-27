import { ImageResponse } from "next/og";
import { getPublicProfile } from "@/lib/publicProfile";

// Branded 1200x630 share card for a public profile — what shows when a /u/<uid>
// link is shared to iMessage, Instagram, X, WhatsApp, etc. Runs on Node (default)
// so it can read via firebase-admin. Wrapped in try/catch so it can never 500.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Join me on Felcin";

// Export-build placeholder (matches the page) so output:export has one param.
export async function generateStaticParams() { return [{ uid: "_" }]; }

const GREEN = "#22c55e";

export default async function Image({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  let p: Awaited<ReturnType<typeof getPublicProfile>> = null;
  try { p = await getPublicProfile(uid); } catch { p = null; }

  const name = p?.displayName || "Felcin";
  const username = p?.username ? `@${p.username}` : "";
  const bio = (p?.bio || "Fitness social — track workouts, runs & PRs").slice(0, 70);
  const photo = p?.photoURL || "";
  const streak = p?.currentStreak || 0;
  const followers = p?.followersCount || 0;
  const initial = name.charAt(0).toUpperCase();

  try {
    return new ImageResponse(
      (
        <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", background: "#0a0a0a", padding: 64, justifyContent: "space-between", fontFamily: "sans-serif" }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: 30, fontWeight: 800 }}>F</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#f2f2f2" }}>Felcin</div>
          </div>

          {/* Identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            {photo
              ? <img src={photo} width={210} height={210} style={{ width: 210, height: 210, borderRadius: 110, objectFit: "cover", border: "5px solid #1f1f1f" }} />
              : <div style={{ width: 210, height: 210, borderRadius: 110, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 100, fontWeight: 800, color: "#666" }}>{initial}</div>}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
              <div style={{ fontSize: 66, fontWeight: 800, color: "#ffffff", lineHeight: 1.02 }}>{name}</div>
              {username ? <div style={{ fontSize: 34, color: "#888888", marginTop: 8 }}>{username}</div> : <div style={{ display: "flex" }} />}
              <div style={{ display: "flex", gap: 16, marginTop: 22 }}>
                {streak > 0 ? <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: "#ff7a1a", background: "rgba(255,122,26,0.12)", padding: "8px 20px", borderRadius: 999 }}>{streak} day streak</div> : <div style={{ display: "flex" }} />}
                {followers > 0 ? <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: "#cccccc", background: "rgba(255,255,255,0.06)", padding: "8px 20px", borderRadius: 999 }}>{followers.toLocaleString()} followers</div> : <div style={{ display: "flex" }} />}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 30, color: "#999999", maxWidth: 720 }}>{bio}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: GREEN }}>Join me on Felcin →</div>
          </div>
        </div>
      ),
      size
    );
  } catch {
    return new ImageResponse(
      (
        <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a0a0a", fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 80, fontWeight: 800, color: GREEN }}>Felcin</div>
          <div style={{ fontSize: 36, color: "#aaaaaa", marginTop: 16 }}>Track workouts, runs & PRs</div>
        </div>
      ),
      size
    );
  }
}
