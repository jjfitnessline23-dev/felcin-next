// Felcin Concierge — in-app AI assistant (Claude Opus 4.8).
//
// Server-side so the system prompt, knowledge base and API key never reach the browser.
// The client POSTs the running transcript; Claude answers from Felcin's knowledge and can
// hand anything it can't resolve to the team (Firestore ticket + email). Signed-in only.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/emailTemplates";
import { OWNER_UIDS } from "@/lib/firebase";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Admin-only assistant (very low volume) → Opus 4.8 for best quality.
const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 24;
const ESCALATION_EMAIL = process.env.ESCALATION_EMAIL || "johnjeannis@gmail.com";

const SYSTEM_PROMPT =
  "You are John's private ADMIN assistant for Felcin — a fitness-first creator social network he " +
  "owns (web + iOS/Android). This is NOT a member-facing bot; you're talking to the owner/an admin. " +
  "Act as a sharp operator: help him understand how Felcin works, run the platform, reason about " +
  "features/growth/monetization/moderation, and think through specific members' situations or issues " +
  "he's investigating. Be direct and concise — lead with the answer, then the reasoning. " +
  "You have LIVE admin tools — USE them instead of guessing: get_platform_stats (users/growth/posts/reels/" +
  "open reports), get_top_creators (who is actually posting — tallies posts+reels by author), lookup_member " +
  "(any member by email or uid), get_reports (moderation queue), and get_my_account (John's own). Pull real " +
  "data before answering 'how many…', 'who are my creators…', or 'look up…' questions. " +
  "If something needs to be logged/followed up, use escalate_to_human (files a ticket + emails the team).";

const KNOWLEDGE = `
FELCIN — WHAT IT IS
- A fitness-focused creator social network at felcin.com (web app + native iOS & Android).
- Members post workouts and content, follow creators, message, track runs, join challenges,
  and support creators financially.

CORE FEATURES
- Feed: posts with photos and video. Reels (short video) and Stories are supported.
- Explore: discover creators and trending content.
- Profiles & following: follow creators to see their posts; bookmarks to save content.
- Messages: direct messages between members.
- Run tracking ("Run"): GPS tracking that draws your run/route on a live map.
- Challenges: join fitness challenges and compete/track progress.
- Stories & Live: post Stories; creators can go Live.
- AI Studio: AI-assisted content creation tools inside the app.
- Workout streaks: keep a daily streak; shown on your home banner and profile.
- Capsule / Dashboard: personal hubs for your activity and stats.

CREATOR MONETIZATION
- Creator badge: a verification badge for creators (handled via Stripe).
- Subscriptions & pay-per-view (PPV): creators charge for premium content.
- Tips / gifts: fans can tip or send gifts.
- Earnings & payouts: creators have an earnings balance and get paid out via Stripe. Monetization
  typically unlocks once a creator reaches a follower threshold. If a member asks about THEIR
  specific balance, a payout date, or a missing payment — ESCALATE, do not guess.
- Advertise: members/creators can run paid ads/promotions in the app.

ACCOUNT & SAFETY
- Sign in with email/password, and native Google/Apple on the apps. Email must be verified.
- Members accept Terms & Privacy and must meet the minimum age.
- Felcin actively moderates: nudity and abuse are blocked at upload and can lead to removal or
  suspension/ban. A member who believes a suspension is a mistake → ESCALATE.
- Report harassment, stolen content, bugs, or anything involving money → ESCALATE.

COMMON "HOW DO I"
- Post: use the composer / + button, add photo or video, publish.
- Track a run: open Run and start tracking; it records your route via GPS.
- Become a creator / get verified: look for the creator badge / creator dashboard flow.
- Save a post: bookmark it. - Go Live / post a Story: from the create/stories area.
`.trim();

const TOOLS: Anthropic.Tool[] = [
  {
    name: "escalate_to_human",
    description:
      "Hand this conversation to the Felcin team when the member needs human or account action " +
      "(refund, payout/earnings problem, account recovery, report of abuse/stolen content, a " +
      "suspension dispute, a bug, or anything you can't resolve from the knowledge). Summarize clearly.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-paragraph summary of the member's issue and what they want." },
        category: {
          type: "string",
          enum: ["payments", "account", "safety", "bug", "content", "other"],
          description: "Best-fit category.",
        },
      },
      required: ["summary", "category"],
    },
  },
  {
    name: "get_my_account",
    description: "Look up the admin's OWN Felcin account (name, creator/verified, followers, earnings).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_platform_stats",
    description:
      "ADMIN: live Felcin platform numbers — total users, new users today/this week, total posts, " +
      "total reels, and open reports. Use for 'how many users do we have', 'how's growth', 'anything to moderate'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "lookup_member",
    description:
      "ADMIN: look up ANY member by email or uid — returns their account summary (name, verified/creator, " +
      "followers, suspended/banned status, earnings). Use when John is investigating a specific member.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The member's email." },
        uid: { type: "string", description: "The member's uid (if known)." },
      },
    },
  },
  {
    name: "get_reports",
    description: "ADMIN: the most recent content/user reports in the moderation queue (newest first).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many (default 10, max 25)." } },
    },
  },
  {
    name: "get_top_creators",
    description:
      "ADMIN: find who is actually posting — tallies recent posts + reels by author and returns the top " +
      "creators with their post/reel counts, name, follower count and verified/creator status. Use for " +
      "'who are my active creators', 'who's posting the most', 'who should I double down on'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many top creators to return (default 10, max 25)." } },
    },
  },
];

// Read the signed-in member's own data — curated allowlist only, so nothing sensitive
// leaks and it works regardless of exact field names (missing fields are just omitted).
async function getMyAccount(uid: string): Promise<string> {
  try {
    const app = getAdminApp();
    if (!app) return JSON.stringify({ error: "account lookup unavailable" });
    const db = app.firestore();
    const [rootSnap, profSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`users/${uid}/public/profile`).get().catch(() => null as any),
    ]);
    const root: any = rootSnap.exists ? rootSnap.data() : {};
    const prof: any = profSnap && profSnap.exists ? profSnap.data() : {};
    const m = { ...prof, ...root };
    const out: Record<string, any> = {};
    const name = m.displayName ?? m.name ?? m.username;
    if (name) out.name = name;
    if (m.email) out.email = m.email;
    const creator = m.isCreator ?? m.creator ?? (m.role === "creator");
    if (creator != null) out.isCreator = !!creator;
    const verified = m.verified ?? m.isVerified ?? m.creatorBadge ?? m.badge;
    if (verified != null) out.verified = !!verified;
    const followers = m.followersCount ?? m.followers ?? m.followerCount;
    if (typeof followers === "number") out.followers = followers;
    const plan = m.plan ?? m.subscription ?? m.tier;
    if (plan) out.plan = plan;
    // Earnings stored in CENTS when present.
    const cents = m.earnings?.amountUsd ?? m.earningsCents ?? m.balanceCents;
    if (typeof cents === "number") out.earningsUsd = `$${(cents / 100).toFixed(2)}`;
    if (Object.keys(out).length === 0) return JSON.stringify({ note: "No profile details found for this account yet." });
    return JSON.stringify(out);
  } catch {
    return JSON.stringify({ error: "Couldn't read the account right now." });
  }
}

// ── Admin-only platform tools (gated to OWNER_UIDS at the route) ──────────────
async function getPlatformStats(): Promise<string> {
  try {
    const app = getAdminApp();
    if (!app) return JSON.stringify({ error: "stats unavailable" });
    const db = app.firestore();
    const dayAgo = new Date(Date.now() - 86_400_000);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const safeCount = async (q: any) => { try { return (await q.count().get()).data().count; } catch { return null; } };
    const [totalUsers, totalPosts, totalReels, openReports, newUsersToday, newUsersThisWeek] = await Promise.all([
      safeCount(db.collection("users")),
      safeCount(db.collection("posts")),
      safeCount(db.collection("reels")),
      safeCount(db.collection("reports")),
      safeCount(db.collection("users").where("createdAt", ">=", dayAgo)),
      safeCount(db.collection("users").where("createdAt", ">=", weekAgo)),
    ]);
    return JSON.stringify({ totalUsers, newUsersToday, newUsersThisWeek, totalPosts, totalReels, openReports });
  } catch {
    return JSON.stringify({ error: "Couldn't read platform stats." });
  }
}

async function lookupMember(input: { email?: string; uid?: string }): Promise<string> {
  try {
    const app = getAdminApp();
    if (!app) return JSON.stringify({ error: "lookup unavailable" });
    const db = app.firestore();
    let data: any = null;
    let uid = "";
    if (input.uid) {
      const s = await db.doc(`users/${input.uid}`).get();
      if (s.exists) { data = s.data(); uid = input.uid; }
    } else if (input.email) {
      const email = String(input.email).trim();
      for (const e of [email.toLowerCase(), email]) {
        const q = await db.collection("users").where("email", "==", e).limit(1).get();
        if (!q.empty) { data = q.docs[0].data(); uid = q.docs[0].id; break; }
      }
    }
    if (!data) return JSON.stringify({ found: false });
    const cents = data.earnings?.amountUsd ?? data.earningsCents ?? data.balanceCents;
    const followers = data.followersCount ?? data.followers;
    return JSON.stringify({
      found: true,
      uid,
      name: data.displayName ?? data.name ?? data.username ?? null,
      email: data.email ?? null,
      isCreator: !!(data.isCreator ?? data.creator ?? data.role === "creator"),
      verified: !!(data.verified ?? data.isVerified ?? data.creatorBadge),
      followers: typeof followers === "number" ? followers : null,
      suspended: !!(data.suspended ?? data.banned ?? data.disabled),
      earningsUsd: typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : null,
    });
  } catch {
    return JSON.stringify({ error: "Couldn't look up that member." });
  }
}

async function getReports(input: { limit?: number }): Promise<string> {
  try {
    const app = getAdminApp();
    if (!app) return JSON.stringify({ error: "reports unavailable" });
    const db = app.firestore();
    const n = Math.min(Math.max(Number(input.limit) || 10, 1), 25);
    const snap = await db.collection("reports").orderBy("createdAt", "desc").limit(n).get();
    const reports = snap.docs.map((d) => {
      const r: any = d.data();
      return {
        id: d.id,
        reason: r.reason ?? r.type ?? r.category ?? null,
        target: r.targetType ?? r.contentType ?? null,
        targetId: r.targetId ?? r.postId ?? r.reelId ?? r.reportedUid ?? null,
        reportedBy: r.reportedBy ?? r.reporterUid ?? r.uid ?? null,
        status: r.status ?? "open",
        when: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : r.createdAt ?? null,
      };
    });
    return JSON.stringify({ count: reports.length, reports });
  } catch {
    return JSON.stringify({ error: "Couldn't read the reports queue." });
  }
}

// Tally recent posts + reels by author → the active creators, enriched with profile data.
async function getTopCreators(input: { limit?: number }): Promise<string> {
  try {
    const app = getAdminApp();
    if (!app) return JSON.stringify({ error: "unavailable" });
    const db = app.firestore();
    const n = Math.min(Math.max(Number(input.limit) || 10, 1), 25);
    const [postsSnap, reelsSnap] = await Promise.all([
      db.collection("posts").orderBy("createdAt", "desc").limit(600).get().catch(() => null as any),
      db.collection("reels").orderBy("createdAt", "desc").limit(400).get().catch(() => null as any),
    ]);
    const tally: Record<string, { posts: number; reels: number }> = {};
    const bump = (snap: any, key: "posts" | "reels") => {
      snap?.docs?.forEach((d: any) => {
        const a = (d.data()?.authorId ?? d.data()?.uid ?? d.data()?.creatorId ?? "").toString();
        if (!a) return;
        tally[a] = tally[a] || { posts: 0, reels: 0 };
        tally[a][key] += 1;
      });
    };
    bump(postsSnap, "posts");
    bump(reelsSnap, "reels");

    const ranked = Object.entries(tally)
      .map(([uid, c]) => ({ uid, ...c, total: c.posts + c.reels }))
      .sort((a, b) => b.total - a.total)
      .slice(0, n);

    const creators = await Promise.all(
      ranked.map(async (r) => {
        let m: any = {};
        try {
          const [root, prof] = await Promise.all([
            db.doc(`users/${r.uid}`).get(),
            db.doc(`users/${r.uid}/public/profile`).get().catch(() => null as any),
          ]);
          m = { ...(prof?.exists ? prof.data() : {}), ...(root.exists ? root.data() : {}) };
        } catch { /* ignore */ }
        const followers = m.followersCount ?? m.followers;
        return {
          uid: r.uid,
          name: m.displayName ?? m.name ?? m.username ?? null,
          email: m.email ?? null,
          posts: r.posts,
          reels: r.reels,
          followers: typeof followers === "number" ? followers : null,
          verified: !!(m.verified ?? m.isVerified ?? m.creatorBadge),
          isCreator: !!(m.isCreator ?? m.creator ?? m.role === "creator"),
        };
      })
    );
    return JSON.stringify({ sampledFrom: { posts: postsSnap?.size ?? 0, reels: reelsSnap?.size ?? 0 }, count: creators.length, creators });
  } catch {
    return JSON.stringify({ error: "Couldn't compute top creators." });
  }
}

async function escalate(
  input: { summary?: string; category?: string },
  uid: string,
  email: string
): Promise<void> {
  const summary = String(input.summary || "").slice(0, 2000);
  const category = String(input.category || "other");
  // Durable record (admin bypasses rules) so nothing is lost even if email fails.
  try {
    const app = getAdminApp();
    if (app) {
      await app.firestore().collection("supportTickets").add({
        uid,
        email: email || null,
        category,
        summary,
        status: "open",
        source: "concierge",
        createdAt: new Date(),
      });
    }
  } catch {
    /* non-fatal */
  }
  try {
    await sendEmail(
      ESCALATION_EMAIL,
      `[Felcin Concierge] ${category} — needs attention`,
      `<p>A Felcin member asked the Concierge for help it couldn't fully resolve.</p>
       <p><b>Category:</b> ${category}<br/><b>Member:</b> ${email || uid}</p>
       <p><b>Summary:</b><br/>${summary.replace(/</g, "&lt;")}</p>`
    );
  } catch {
    /* non-fatal */
  }
  await reportToCommandCenter("felcin", category, summary, email || uid);
}

// Report every escalation up to Command Center (the master) so John sees all apps'
// support in one place + gets an instant alert. Best-effort; never blocks the reply.
async function reportToCommandCenter(appId: string, category: string, summary: string, who: string): Promise<void> {
  const sec = process.env.ASSISTANT_INGEST_SECRET;
  if (!sec) return;
  try {
    await fetch("https://command-center-nine-blue.vercel.app/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": sec },
      body: JSON.stringify({
        appId,
        type: "support",
        title: `Support escalation — ${category}`,
        detail: `${who}: ${summary}`.slice(0, 480),
        ts: Date.now(),
        dedupeKey: `support:${appId}:${Date.now()}`,
      }),
    });
  } catch {
    /* non-fatal */
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  // Admin-only — owner UID OR admin email (looked up from the uid). Defense in depth.
  let isAdmin = OWNER_UIDS.includes(uid);
  if (!isAdmin) {
    try {
      const rec = await getAdminApp()?.auth().getUser(uid);
      isAdmin = ["johnjeannis@gmail.com", "jjfitnessline23@gmail.com"].includes((rec?.email || "").toLowerCase());
    } catch { /* ignore */ }
  }
  if (!isAdmin) return NextResponse.json({ error: "This assistant is for admins only." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Assistant not configured" }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body?.messages) ? body.messages : [];
    const userEmail = typeof body?.userEmail === "string" ? body.userEmail.slice(0, 200) : "";

    const messages: Anthropic.MessageParam[] = incoming
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "Expected a user message." }, { status: 400 });
    }

    let escalated = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1536,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [
          {
            type: "text",
            text: `${SYSTEM_PROMPT}\n\n--- FELCIN KNOWLEDGE ---\n${KNOWLEDGE}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          if (block.name === "escalate_to_human") {
            await escalate(block.input as any, uid, userEmail);
            escalated = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Escalated to the Felcin team. Tell the member it's been passed on and someone will follow up.",
            });
          } else if (block.name === "get_my_account") {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: await getMyAccount(uid) });
          } else if (block.name === "get_platform_stats") {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: await getPlatformStats() });
          } else if (block.name === "lookup_member") {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: await lookupMember(block.input as any) });
          } else if (block.name === "get_reports") {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: await getReports(block.input as any) });
          } else if (block.name === "get_top_creators") {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: await getTopCreators(block.input as any) });
          } else {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Unknown tool.", is_error: true });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return NextResponse.json({ reply: reply || "I'm here to help — could you rephrase that?", escalated });
    }

    return NextResponse.json({ reply: "I've passed this to the Felcin team — they'll follow up with you.", escalated: true });
  } catch (err: any) {
    console.error("concierge error", err?.message || err);
    return NextResponse.json({ error: "The assistant is unavailable right now. Please try again shortly." }, { status: 500 });
  }
}
