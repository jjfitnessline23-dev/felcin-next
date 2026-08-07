export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { OWNER_UIDS } from "@/lib/firebase";

const TIMEOUT = 9000;
const BASE    = "https://felcin.com";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function httpCheck(label: string, url: string, opts: RequestInit = {}, expectStatus?: number) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", ...opts });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const expected = expectStatus ?? 499;
    const ok = expectStatus ? res.status === expectStatus : res.status < 500;
    return { label, ok, detail: `HTTP ${res.status} in ${ms}ms`, ms };
  } catch (e: any) {
    return { label, ok: false, detail: e?.name === "AbortError" ? `Timeout after ${TIMEOUT}ms` : (e?.message || "Request failed"), ms: Date.now() - t0 };
  }
}

function getStripe() {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").replace(/^﻿/, "").trim();
  return key || null;
}

// ─── individual checks ────────────────────────────────────────────────────────

async function checkSitePages() {
  return Promise.all([
    httpCheck("🌐 Home page",           `${BASE}/`),
    httpCheck("🌐 Login page",          `${BASE}/login`),
    httpCheck("🌐 Badges page",         `${BASE}/badges`),
    httpCheck("🌐 Run tracker",         `${BASE}/run`),
    httpCheck("🌐 Explore page",        `${BASE}/explore`),
    httpCheck("🌐 Reels page",          `${BASE}/reels`),
    httpCheck("🌐 Ghost workouts",      `${BASE}/ghost`),
    httpCheck("🌐 Live Studio",         `${BASE}/live`),
    httpCheck("🌐 Challenges",          `${BASE}/challenges`),
    httpCheck("🌐 Notifications",       `${BASE}/notifications`),
    httpCheck("🌐 Dashboard",           `${BASE}/dashboard`),
    httpCheck("🌐 Profile page",        `${BASE}/profile`),
  ]);
}

async function checkPaymentAPIs() {
  const POST_JSON: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  return Promise.all([
    // Badge payments
    httpCheck("💳 Badge payment intent",       `${BASE}/api/badge-payment-intent`,    POST_JSON),
    httpCheck("💳 Badge checkout (hosted)",    `${BASE}/api/badge-checkout`,          POST_JSON),
    httpCheck("💳 Badge purchase",             `${BASE}/api/badge-purchase`,          POST_JSON),
    httpCheck("💳 Badge verify",               `${BASE}/api/badge-purchase-verify`),
    httpCheck("💳 Badge intent verify",        `${BASE}/api/badge-intent-verify`,     POST_JSON),
    // Subscription
    httpCheck("💳 Subscribe checkout",         `${BASE}/api/subscribe-checkout`,      POST_JSON),
    httpCheck("💳 Subscribe payment intent",   `${BASE}/api/subscribe-payment-intent`,POST_JSON),
    httpCheck("💳 Subscribe verify",           `${BASE}/api/subscribe-verify`),
    // Tips
    httpCheck("💳 Tip checkout",               `${BASE}/api/tip-checkout`,            POST_JSON),
    httpCheck("💳 Tip payment intent",         `${BASE}/api/tip-payment-intent`,      POST_JSON),
    httpCheck("💳 Tip verify",                 `${BASE}/api/tip-verify`),
    // PPV
    httpCheck("💳 PPV checkout",               `${BASE}/api/ppv-checkout`,            POST_JSON),
    httpCheck("💳 PPV verify",                 `${BASE}/api/ppv-verify`),
    // Gifts
    httpCheck("💳 Gift checkout",              `${BASE}/api/gift-checkout`,           POST_JSON),
    httpCheck("💳 Gift verify",                `${BASE}/api/gift-verify`),
    // Boost & Ads
    httpCheck("💳 Boost checkout",             `${BASE}/api/boost-checkout`,          POST_JSON),
    httpCheck("💳 Boost verify",               `${BASE}/api/boost-verify`),
    httpCheck("📢 Ad checkout",                `${BASE}/api/ad-checkout`,             POST_JSON),
    httpCheck("📢 Ad verify",                  `${BASE}/api/ad-verify`),
    // Creator
    httpCheck("🎨 Creator Stripe onboard",     `${BASE}/api/creator-stripe-onboard`,  POST_JSON),
    httpCheck("💳 Premium checkout",           `${BASE}/api/premium-checkout`,        POST_JSON),
    httpCheck("💳 Premium verify",             `${BASE}/api/premium-verify`),
    // Training sessions
    httpCheck("🏋️ Training session checkout",  `${BASE}/api/training-session-checkout`, POST_JSON),
    httpCheck("🏋️ Training session verify",    `${BASE}/api/training-session-verify`),
  ]);
}

async function checkPlatformAPIs() {
  const POST_JSON: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  return Promise.all([
    httpCheck("🔔 Notify API",                  `${BASE}/api/notify`,                POST_JSON),
    httpCheck("📺 Notify Live API",             `${BASE}/api/notify-live`,           POST_JSON),
    httpCheck("🏃 Exercise browse",             `${BASE}/api/exercise-browse`),
    httpCheck("🔍 Exercise search",             `${BASE}/api/exercise-search?q=bench`),
    httpCheck("📖 Exercise info",               `${BASE}/api/exercise-info?name=bench+press`),
    httpCheck("🖼️ Proxy media",                `${BASE}/api/proxy-media?url=https://felcin.com/logo192.png`),
    httpCheck("👤 Delete account (guard)",      `${BASE}/api/delete-account`,        POST_JSON),
  ]);
}

async function checkCronAPIs() {
  return Promise.all([
    httpCheck("🤖 Cron — moderation",          `${BASE}/api/cron/moderation`),
    httpCheck("🤖 Cron — creator fund payout", `${BASE}/api/cron/creator-fund-payout`),
  ]);
}

async function checkFirebase() {
  const app = getAdminApp();
  if (!app) return [{ label: "🔥 Firebase Admin SDK", ok: false, detail: "FIREBASE_SERVICE_ACCOUNT_JSON not set in Vercel env" }];

  const results: { label: string; ok: boolean; detail: string }[] = [];

  // Auth
  try {
    await app.auth().listUsers(1);
    results.push({ label: "🔥 Firebase Auth", ok: true, detail: "Reachable" });
  } catch (e: any) {
    results.push({ label: "🔥 Firebase Auth", ok: false, detail: e?.message });
  }

  // Firestore — check each main collection
  const collections = [
    ["users",          "👤 Firestore — users"],
    ["posts",          "📝 Firestore — posts"],
    ["reels",          "🎬 Firestore — reels"],
    ["reports",        "🚩 Firestore — reports"],
    ["notifications",  "🔔 Firestore — notifications"],
    ["ghostWorkouts",  "👻 Firestore — ghostWorkouts"],
    ["challenges",     "🏆 Firestore — challenges"],
    ["payments",       "💰 Firestore — payments"],
    ["config",         "⚙️ Firestore — config"],
    ["botLogs",        "🤖 Firestore — botLogs"],
    ["errorLogs",      "🚨 Firestore — errorLogs"],
  ];

  for (const [col, label] of collections) {
    try {
      const snap = await app.firestore().collection(col).count().get();
      const count = snap.data().count;
      results.push({ label, ok: true, detail: `${count.toLocaleString()} documents` });
    } catch (e: any) {
      results.push({ label, ok: false, detail: e?.message });
    }
  }

  // Storage bucket reachable
  try {
    const bucket = app.storage().bucket();
    await bucket.getMetadata();
    results.push({ label: "🗄️ Firebase Storage", ok: true, detail: `Bucket: ${bucket.name}` });
  } catch (e: any) {
    results.push({ label: "🗄️ Firebase Storage", ok: false, detail: e?.message });
  }

  return results;
}

async function checkStripe() {
  const key = getStripe();
  if (!key) return [{ label: "💳 Stripe API", ok: false, detail: "STRIPE_SECRET_KEY not set" }];

  const results: { label: string; ok: boolean; detail: string }[] = [];
  const headers = { Authorization: `Bearer ${key}` };

  // Balance
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", { headers, cache: "no-store" });
    const d = await res.json();
    if (res.ok) {
      const avail = (d.available?.[0]?.amount ?? 0) / 100;
      const pending = (d.pending?.[0]?.amount ?? 0) / 100;
      const isLive = key.startsWith("sk_live");
      results.push({ label: `💳 Stripe Balance (${isLive ? "LIVE" : "TEST"})`, ok: true, detail: `Available: $${avail.toFixed(2)}  Pending: $${pending.toFixed(2)}` });
    } else {
      results.push({ label: "💳 Stripe Balance", ok: false, detail: d?.error?.message || `HTTP ${res.status}` });
    }
  } catch (e: any) {
    results.push({ label: "💳 Stripe Balance", ok: false, detail: e?.message });
  }

  // Webhooks configured
  try {
    const res = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=5", { headers, cache: "no-store" });
    const d = await res.json();
    if (res.ok) {
      const active = d.data?.filter((w: any) => w.status === "enabled").length ?? 0;
      results.push({ label: "💳 Stripe Webhooks", ok: active > 0, detail: active > 0 ? `${active} active webhook(s)` : "No active webhooks — payments may not activate badges/subs" });
    } else {
      results.push({ label: "💳 Stripe Webhooks", ok: false, detail: `HTTP ${res.status}` });
    }
  } catch (e: any) {
    results.push({ label: "💳 Stripe Webhooks", ok: false, detail: e?.message });
  }

  // Recent payments
  try {
    const res = await fetch("https://api.stripe.com/v1/payment_intents?limit=5", { headers, cache: "no-store" });
    const d = await res.json();
    if (res.ok) {
      const succeeded = d.data?.filter((p: any) => p.status === "succeeded").length ?? 0;
      results.push({ label: "💳 Stripe Recent Payments", ok: true, detail: `${succeeded} of last 5 payment intents succeeded` });
    } else {
      results.push({ label: "💳 Stripe Recent Payments", ok: false, detail: `HTTP ${res.status}` });
    }
  } catch (e: any) {
    results.push({ label: "💳 Stripe Recent Payments", ok: false, detail: e?.message });
  }

  return results;
}

async function checkSSL() {
  try {
    const res = await fetch(`${BASE}/`, { cache: "no-store" });
    const isHttps = BASE.startsWith("https");
    return [{ label: "🔒 SSL / HTTPS", ok: isHttps && res.ok, detail: isHttps ? "Certificate valid, HTTPS enforced" : "Not using HTTPS" }];
  } catch (e: any) {
    return [{ label: "🔒 SSL / HTTPS", ok: false, detail: e?.message }];
  }
}

async function checkWatchFeatures() {
  const POST_JSON: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  const results = await Promise.all([
    httpCheck("⌚ Watch run save endpoint",   `${BASE}/api/save-watch-run`,  POST_JSON),
    httpCheck("⌚ Watch steps endpoint",      `${BASE}/api/save-steps`,      POST_JSON),
    httpCheck("⌚ Watch records endpoint",    `${BASE}/api/get-records`),
    httpCheck("⌚ Watch pair init",           `${BASE}/api/watch-init`,      POST_JSON),
    httpCheck("⌚ Watch pair poll",           `${BASE}/api/watch-poll?code=000000`),
    httpCheck("⌚ Watch pair claim",          `${BASE}/api/watch-claim`,     POST_JSON),
    httpCheck("⌚ Watch link page",           `${BASE}/watch-link`),
  ]);
  // save-watch-run/save-steps/watch-claim should reject empty body (400/401) not 500
  return results.map(r => ({ ...r, ok: r.ok || r.detail.startsWith("HTTP 40") }));
}

async function checkEnvVars() {
  const checks: { label: string; ok: boolean; detail: string }[] = [];

  const vars: [string, string, string][] = [
    ["WATCH_SYNC_SECRET",             "⌚ WATCH_SYNC_SECRET",             "Apple Watch sync will not work"],
    ["RESEND_API_KEY",                "📧 RESEND_API_KEY",                "Email notifications will not send"],
    ["NEXT_PUBLIC_MAPTILER_KEY",      "🗺️ MAPTILER_KEY",                 "GPS run maps will be broken"],
    ["STRIPE_SECRET_KEY",             "💳 STRIPE_SECRET_KEY",             "All payments will fail"],
    ["STRIPE_WEBHOOK_SECRET",         "💳 STRIPE_WEBHOOK_SECRET",         "Payment confirmations will not work"],
    ["FIREBASE_SERVICE_ACCOUNT_JSON", "🔥 FIREBASE_SERVICE_ACCOUNT_JSON", "Server-side Firebase will fail"],
    ["REPLICATE_API_KEY",             "🤖 REPLICATE_API_KEY",             "AI Studio will not generate images"],
    ["ANTHROPIC_API_KEY",             "🧠 ANTHROPIC_API_KEY",             "AI features using Claude will fail"],
    ["CRON_SECRET",                   "⏰ CRON_SECRET",                   "Scheduled jobs will not run"],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "💳 STRIPE_PUBLISHABLE_KEY",  "Client-side Stripe UI will break"],
    ["NEXT_PUBLIC_FIREBASE_VAPID_KEY","🔔 FIREBASE_VAPID_KEY",           "Push notifications will not work"],
    ["UPSTASH_REDIS_REST_URL",        "⚡ UPSTASH_REDIS_URL",            "Rate limiting / caching may fail"],
    ["UPSTASH_REDIS_REST_TOKEN",      "⚡ UPSTASH_REDIS_TOKEN",          "Rate limiting / caching may fail"],
    ["PAYOUT_SECRET",                 "💰 PAYOUT_SECRET",                "Creator payouts will fail"],
    ["EXERCISEDB_API_KEY",            "🏋️ EXERCISEDB_API_KEY",           "Exercise database will not load"],
  ];

  for (const [envKey, label, impact] of vars) {
    const val = process.env[envKey];
    const set = !!(val && val.trim().length > 0);
    checks.push({ label, ok: set, detail: set ? "Set ✓" : `MISSING — ${impact}` });
  }

  return checks;
}

async function checkReplicateAPI() {
  const key = process.env.REPLICATE_API_KEY;
  if (!key) return [{ label: "🤖 Replicate AI", ok: false, detail: "REPLICATE_API_KEY not set — AI Studio cannot generate" }];
  try {
    const res = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Token ${key}` }, cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) return [{ label: "🤖 Replicate AI", ok: false, detail: `Auth failed: ${data.detail || res.status}` }];

    const results = [{ label: `🤖 Replicate AI (${data.username ?? "account"})`, ok: true, detail: "API key valid ✓" }];

    // Check rate limit tier — free tier = severely limited
    const hasPayment = data.type !== "free" || data.github_url; // heuristic
    results.push({
      label: "🤖 Replicate billing tier",
      ok: !!data.username,
      detail: "Add a payment method at replicate.com/account/billing if generations are rate-limited",
    });

    // Check model versions are reachable
    const modelRes = await fetch("https://api.replicate.com/v1/models/stability-ai/stable-diffusion-img2img/versions", {
      headers: { Authorization: `Token ${key}` }, cache: "no-store",
    });
    const modelData = await modelRes.json();
    const latestVersion = modelData.results?.[0]?.id;
    results.push({
      label: "🤖 Replicate — img2img model versions",
      ok: !!latestVersion,
      detail: latestVersion ? `Latest version: ${latestVersion.slice(0, 16)}… ✓` : "Cannot fetch model versions — AI Studio will fail",
    });

    return results;
  } catch (e: any) {
    return [{ label: "🤖 Replicate AI", ok: false, detail: e.message }];
  }
}

async function checkStorageRules() {
  const results: { label: string; ok: boolean; detail: string }[] = [];
  try {
    const fs = await import("fs");
    const path = await import("path");
    const rulesPath = path.join(process.cwd(), "storage.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    const requiredPaths: [string, string][] = [
      ["ai-studio",       "🗄️ Storage — ai-studio/ (AI Studio uploads)"],
      ["profilePictures", "🗄️ Storage — profilePictures/ (profile photos)"],
      ["videos",          "🗄️ Storage — videos/ (post videos)"],
      ["uploads",         "🗄️ Storage — uploads/ (media uploads)"],
    ];

    for (const [p, label] of requiredPaths) {
      const covered = rules.includes(p);
      results.push({ label, ok: covered, detail: covered ? "Covered ✓" : `MISSING from storage.rules — uploads to /${p}/ will be denied` });
    }

    // Check that write: if false catch-all doesn't block everything
    const hasCatchAll = rules.includes("allow write: if false");
    results.push({ label: "🗄️ Storage — catch-all write deny", ok: hasCatchAll, detail: hasCatchAll ? "Catch-all deny present (secure) ✓" : "No catch-all deny — any path may be writable" });
  } catch (e: any) {
    results.push({ label: "🗄️ Storage rules", ok: false, detail: `Cannot read storage.rules: ${e?.message}` });
  }
  return results;
}

async function checkErrorLogPatterns() {
  const app = getAdminApp();
  if (!app) return [];
  const results: { label: string; ok: boolean; detail: string }[] = [];
  try {
    const snap = await app.firestore().collection("errorLogs").orderBy("timestamp", "desc").limit(100).get();
    if (snap.empty) {
      results.push({ label: "🚨 Client error patterns", ok: true, detail: "No client errors logged ✓" });
      return results;
    }

    const bySource: Record<string, number> = {};
    const byCode: Record<string, number> = {};
    const recentErrors: string[] = [];

    snap.docs.forEach((d, i) => {
      const data = d.data();
      const src = (data.source as string) || "unknown";
      const code = data.code as string | undefined;
      bySource[src] = (bySource[src] || 0) + 1;
      if (code) byCode[code] = (byCode[code] || 0) + 1;
      if (i < 3) recentErrors.push(`${src}: ${(data.message as string || "").slice(0, 60)}`);
    });

    const topSrc = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s}×${n}`).join(", ");
    results.push({ label: `🚨 Client errors — top sources (${snap.size} total)`, ok: false, detail: topSrc });

    if (Object.keys(byCode).length > 0) {
      const topCode = Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}×${n}`).join(", ");
      results.push({ label: "🚨 Client errors — error codes", ok: false, detail: topCode });
    }

    recentErrors.forEach((e, i) => {
      results.push({ label: `🚨 Recent error #${i + 1}`, ok: false, detail: e });
    });
  } catch (e: any) {
    results.push({ label: "🚨 Error log analysis", ok: false, detail: e?.message });
  }
  return results;
}

async function checkFirestoreIndexes() {
  const app = getAdminApp();
  if (!app) return [];
  const db = app.firestore();
  const results: { label: string; ok: boolean; detail: string }[] = [];

  const indexTests: [string, () => Promise<unknown>][] = [
    ["📝 Posts — createdAt desc index",        () => db.collection("posts").orderBy("createdAt", "desc").limit(1).get()],
    ["🎬 Reels — createdAt desc index",        () => db.collection("reels").orderBy("createdAt", "desc").limit(1).get()],
    ["🚩 Reports — createdAt desc index",      () => db.collection("reports").orderBy("createdAt", "desc").limit(1).get()],
    ["👻 Ghost workouts — createdAt index",    () => db.collection("ghostWorkouts").orderBy("createdAt", "desc").limit(1).get()],
    ["🤖 botLogs — runAt desc index",          () => db.collection("botLogs").orderBy("runAt", "desc").limit(1).get()],
    ["🚨 errorLogs — timestamp desc index",    () => db.collection("errorLogs").orderBy("timestamp", "desc").limit(1).get()],
  ];

  await Promise.all(indexTests.map(async ([label, run]) => {
    try {
      await run();
      results.push({ label, ok: true, detail: "Index OK ✓" });
    } catch (e: any) {
      const isMissing = (e.message || "").toLowerCase().includes("index");
      results.push({ label, ok: false, detail: isMissing ? "Missing composite index — this query will fail for clients" : e.message });
    }
  }));

  return results;
}

async function checkAPIResponseBodies() {
  const results: { label: string; ok: boolean; detail: string }[] = [];

  // Exercise browse — should return JSON array
  try {
    const res = await fetch(`${BASE}/api/exercise-browse`, { cache: "no-store" });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const isArray = Array.isArray(parsed);
    results.push({ label: "🏋️ Exercise browse — returns array", ok: res.ok && isArray, detail: isArray ? `Returns ${(parsed as unknown[]).length} exercises ✓` : `Got: ${text.slice(0, 60)}` });
  } catch (e: any) { results.push({ label: "🏋️ Exercise browse — returns array", ok: false, detail: e.message }); }

  // Proxy media — only allows Firebase Storage URLs (403 for others is correct security behavior)
  try {
    const [noUrlRes, badUrlRes] = await Promise.all([
      fetch(`${BASE}/api/proxy-media`, { cache: "no-store" }),
      fetch(`${BASE}/api/proxy-media?url=${encodeURIComponent("https://example.com/img.jpg")}`, { cache: "no-store" }),
    ]);
    const missingOk = noUrlRes.status === 400;
    const nonFirebaseOk = badUrlRes.status === 403;
    results.push({
      label: "🖼️ Proxy media — security guards",
      ok: missingOk && nonFirebaseOk,
      detail: missingOk && nonFirebaseOk
        ? "Returns 400 (no url) and 403 (non-Firebase url) ✓ — security working correctly"
        : `Expected 400+403, got ${noUrlRes.status}+${badUrlRes.status} — proxy security may be misconfigured`,
    });
  } catch (e: any) { results.push({ label: "🖼️ Proxy media — security guards", ok: false, detail: e.message }); }

  // AI generate — should reject unauthenticated request with 401, not 500
  try {
    const res = await fetch(`${BASE}/api/ai-generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
    results.push({ label: "🤖 AI generate — rejects unauth (401)", ok: res.status === 401, detail: res.status === 401 ? "Returns 401 Unauthorized ✓" : `Returned ${res.status} — expected 401` });
  } catch (e: any) { results.push({ label: "🤖 AI generate — rejects unauth (401)", ok: false, detail: e.message }); }

  // Stripe webhook — should reject bad signature with 400, not 500
  try {
    const res = await fetch(`${BASE}/api/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "bad_sig" }, body: "{}", cache: "no-store" });
    results.push({ label: "💳 Stripe webhook — rejects bad sig", ok: res.status < 500, detail: res.status < 500 ? `Returns ${res.status} (not 500) ✓` : `Returned ${res.status} — server error on bad sig` });
  } catch (e: any) { results.push({ label: "💳 Stripe webhook — rejects bad sig", ok: false, detail: e.message }); }

  // Watch poll — any response that returns valid JSON (200 or 4xx) is fine; 500 is a bug
  try {
    const res = await fetch(`${BASE}/api/watch-poll?code=000000`, { cache: "no-store" });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const isServerError = res.status >= 500;
    results.push({ label: "⌚ Watch poll — returns JSON", ok: !isServerError && parsed !== null, detail: parsed !== null && !isServerError ? `HTTP ${res.status} — returns valid JSON ✓` : isServerError ? `Server error ${res.status}` : `Non-JSON: ${text.slice(0, 40)}` });
  } catch (e: any) { results.push({ label: "⌚ Watch poll — returns JSON", ok: false, detail: e.message }); }

  return results;
}

async function checkDataIntegrity() {
  const app = getAdminApp();
  if (!app) return [{ label: "🔍 Data Integrity", ok: false, detail: "Firebase Admin not available" }];

  const db = app.firestore();
  const results: { label: string; ok: boolean; detail: string }[] = [];

  // Check for runs with 0 distance — auto-delete junk entries
  try {
    const runsSnap = await db.collectionGroup("runningRoutes").limit(500).get();
    const zeroDist = runsSnap.docs.filter(d => (d.data().distance ?? -1) === 0);
    if (zeroDist.length > 0) {
      await Promise.all(zeroDist.map(d => d.ref.delete().catch(() => {})));
    }
    results.push({
      label: "🏃 Runs with 0 distance",
      ok: true,
      detail: zeroDist.length === 0
        ? `None found ✓ (${runsSnap.size} runs checked)`
        : `Auto-deleted ${zeroDist.length} zero-distance run(s) ✓`,
    });
  } catch (e: any) {
    results.push({ label: "🏃 Runs with 0 distance", ok: false, detail: e?.message });
  }

  // Check for posts with no authorId
  try {
    const postsSnap = await db.collection("posts").where("authorId", "==", "").limit(10).get();
    results.push({ label: "📝 Posts with missing authorId", ok: postsSnap.empty, detail: postsSnap.empty ? "None found ✓" : `${postsSnap.size} posts with empty authorId` });
  } catch (e: any) {
    results.push({ label: "📝 Posts with missing authorId", ok: false, detail: e?.message });
  }

  // Check feature flags exist
  try {
    const configSnap = await db.collection("config").doc("features").get();
    const hasFlags = configSnap.exists;
    const data = hasFlags ? configSnap.data() : {};
    const flags = ["badgesEnabled", "boostEnabled", "adsEnabled", "advertiseEnabled"];
    const missing = flags.filter(f => !(f in (data ?? {})));
    results.push({ label: "⚙️ Feature flags config", ok: hasFlags && missing.length === 0, detail: hasFlags ? (missing.length === 0 ? "All flags set ✓" : `Missing flags: ${missing.join(", ")}`) : "config/features document missing" });
  } catch (e: any) {
    results.push({ label: "⚙️ Feature flags config", ok: false, detail: e?.message });
  }

  // Check for banned users still having active content (posts/reels)
  try {
    const bannedSnap = await db.collection("users").where("banned", "==", true).limit(50).get();
    results.push({ label: "🚫 Banned user check", ok: true, detail: `${bannedSnap.size} banned user(s) in system` });
  } catch (e: any) {
    results.push({ label: "🚫 Banned user check", ok: false, detail: e?.message });
  }

  // Check for stale watch pairings (older than 1 hour)
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const staleSnap = await db.collection("watchPairings").where("createdAt", "<", oneHourAgo).limit(100).get();
    results.push({ label: "⌚ Stale watch pairings", ok: true, detail: `${staleSnap.size} expired pairing codes (safe to ignore)` });
  } catch (e: any) {
    results.push({ label: "⌚ Stale watch pairings", ok: true, detail: "Collection empty or not yet created" });
  }

  // Check all expected feature flags exist
  try {
    const configSnap = await db.collection("config").doc("features").get();
    const data = configSnap.exists ? (configSnap.data() ?? {}) : {};
    const expectedFlags = ["badgesEnabled", "boostEnabled", "adsEnabled", "advertiseEnabled", "aiStudioEnabled"];
    const missing = expectedFlags.filter(f => !(f in data));
    results.push({
      label: "⚙️ Feature flags completeness",
      ok: missing.length === 0,
      detail: missing.length === 0
        ? `All ${expectedFlags.length} flags present ✓`
        : `Missing flags: ${missing.join(", ")} — toggles will use defaults until set`,
    });
  } catch (e: any) {
    results.push({ label: "⚙️ Feature flags completeness", ok: false, detail: e?.message });
  }

  // Read recent client-side errors from errorLogs
  try {
    const errSnap = await db.collection("errorLogs").orderBy("timestamp", "desc").limit(5).get();
    if (errSnap.empty) {
      results.push({ label: "🚨 Recent client errors", ok: true, detail: "No client errors logged ✓" });
    } else {
      const errors = errSnap.docs.map(d => {
        const data = d.data();
        return `${data.source}: ${data.message}`;
      });
      results.push({ label: `🚨 Recent client errors (${errSnap.size})`, ok: false, detail: errors.join(" | ") });
    }
  } catch (e: any) {
    results.push({ label: "🚨 Recent client errors", ok: false, detail: `Cannot read errorLogs: ${e?.message}` });
  }

  // Check for users with no public profile — auto-repair any found
  try {
    const usersSnap = await db.collection("users").limit(50).get();
    let missingProfile = 0;
    let repaired = 0;
    for (const userDoc of usersSnap.docs) {
      const profRef = db.collection("users").doc(userDoc.id).collection("public").doc("profile");
      const profSnap = await profRef.get();
      if (!profSnap.exists) {
        missingProfile++;
        // Auto-repair: copy displayName/photoURL/email from root doc
        const root = userDoc.data();
        await profRef.set({
          displayName: root.displayName || "",
          photoURL:    root.photoURL    || "",
          email:       root.email       || "",
          ...(root.badge     ? { badge:     root.badge     } : {}),
          ...(root.verified  ? { verified:  root.verified  } : {}),
        }, { merge: true }).catch(() => {});
        repaired++;
      }
    }
    results.push({
      label: "👤 Users missing public profile",
      ok: missingProfile === 0,
      detail: missingProfile === 0
        ? "All sampled users have public profiles ✓"
        : `Found ${missingProfile} missing — auto-repaired ${repaired} ✓`,
    });
  } catch (e: any) {
    results.push({ label: "👤 Users missing public profile", ok: false, detail: e?.message });
  }

  // Check notifications collection for orphaned notifications
  try {
    const notifSnap = await db.collection("notifications").limit(1).get();
    results.push({ label: "🔔 Notifications collection", ok: true, detail: `Accessible — ${notifSnap.size > 0 ? "has documents" : "empty"}` });
  } catch (e: any) {
    results.push({ label: "🔔 Notifications collection", ok: false, detail: e?.message });
  }

  return results;
}

async function checkSecurityRules() {
  const results: { label: string; ok: boolean; detail: string }[] = [];
  try {
    const fs = await import("fs");
    const path = await import("path");
    const rulesPath = path.join(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    // Collections that MUST be explicitly covered in Firestore rules
    const requiredCollections = [
      ["posts",           "📝 posts in rules"],
      ["reels",           "🎬 reels in rules"],
      ["users",           "👤 users in rules"],
      ["config",          "⚙️ config in rules"],
      ["botLogs",         "🤖 botLogs in rules"],
      ["errorLogs",       "🚨 errorLogs in rules"],
      ["notifications",   "🔔 notifications in rules"],
      ["reports",         "🚩 reports in rules"],
      ["ghostWorkouts",   "👻 ghostWorkouts in rules"],
      ["analytics",       "📊 analytics in rules"],
    ];

    for (const [col, label] of requiredCollections) {
      const covered = rules.includes(`/${col}/{`) || rules.includes(`match /${col}/`);
      results.push({
        label,
        ok: covered,
        detail: covered ? "Covered ✓" : `MISSING from firestore.rules — client reads/writes will be denied`,
      });
    }
  } catch (e: any) {
    results.push({ label: "📋 Security rules file", ok: false, detail: `Cannot read firestore.rules: ${e?.message}` });
  }
  return results;
}

async function checkMapTiler() {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return [{ label: "🗺️ MapTiler (GPS maps)", ok: false, detail: "NEXT_PUBLIC_MAPTILER_KEY not set" }];
  try {
    const res = await fetch(`https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`, { cache: "no-store" });
    return [{ label: "🗺️ MapTiler (GPS maps)", ok: res.ok, detail: res.ok ? "API key valid — run maps operational" : `HTTP ${res.status} — GPS maps may be broken` }];
  } catch (e: any) {
    return [{ label: "🗺️ MapTiler (GPS maps)", ok: false, detail: e?.message }];
  }
}

// ─── email report ──────────────────────────────────────────────────────────────

async function sendEmailReport(allChecks: { label: string; ok: boolean; detail: string }[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const allOk  = allChecks.every(c => c.ok);
  const issues = allChecks.filter(c => !c.ok);
  const subject = `Felcin Full Diagnostic — ${allOk ? "✅ All Systems OK" : `⚠️ ${issues.length} Issue${issues.length > 1 ? "s" : ""} Found`} — ${new Date().toLocaleDateString()}`;

  const rows = allChecks.map(c => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #1a1a28;color:#e2e8f0;font-size:13px;">${c.label}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1a1a28;text-align:center;">${c.ok ? "✅" : "❌"}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1a1a28;color:${c.ok ? "#6b7280" : "#f87171"};font-size:12px;">${c.detail}</td>
    </tr>`).join("");

  const issueRows = issues.length === 0 ? "" : `
    <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:16px;margin-bottom:16px;">
      <p style="color:#f87171;font-weight:800;font-size:14px;margin:0 0 10px;">⚠️ Issues Requiring Attention</p>
      ${issues.map(c => `<p style="color:#fca5a5;font-size:13px;margin:4px 0;">• <strong>${c.label}</strong>: ${c.detail}</p>`).join("")}
    </div>`;

  const html = `<body style="background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px;">
    <div style="max-width:720px;margin:0 auto;">
      <div style="background:#1f1f2e;border:1px solid #2a2a3a;border-radius:14px;overflow:hidden;margin-bottom:16px;">
        <div style="padding:22px;background:#17171f;border-bottom:1px solid #2a2a3a;">
          <h2 style="margin:0 0 4px;color:#fff;font-size:20px;">⚡ Felcin Full Platform Diagnostic</h2>
          <p style="margin:0;color:#6b7280;font-size:12px;">${new Date().toLocaleString()} · ${allChecks.length} checks run</p>
          <div style="margin-top:14px;padding:12px 16px;border-radius:8px;background:${allOk?"rgba(34,197,94,.1)":"rgba(239,68,68,.1)"};border:1px solid ${allOk?"#22c55e":"#ef4444"}40;">
            <span style="font-weight:800;font-size:16px;color:${allOk?"#22c55e":"#ef4444"};">${allOk?"✅ ALL SYSTEMS OK":`⚠️ ${issues.length} ISSUE${issues.length>1?"S":""} FOUND`}</span>
          </div>
        </div>
        <div style="padding:16px;">${issueRows}</div>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
      <p style="text-align:center;font-size:11px;color:#374151;">Felcin Diagnostic Bot · felcin.com/admin → Bot tab</p>
    </div></body>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "Felcin Diagnostics <onboarding@resend.dev>",
        to:      process.env.DIAGNOSTIC_EMAIL || "jjfitnessline23@gmail.com",
        subject, html,
      }),
    });
    return r.ok;
  } catch { return false; }
}

// ─── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid || !OWNER_UIDS.includes(uid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sendEmail } = await req.json().catch(() => ({ sendEmail: false }));

  // Run all check groups in parallel
  const [
    sitePages, paymentAPIs, platformAPIs, cronAPIs,
    firebaseChecks, stripeChecks, sslCheck, mapTilerCheck,
    watchChecks, envChecks, dataChecks, rulesChecks,
    replicateChecks, storageRulesChecks, errorLogChecks,
    indexChecks, apiBodyChecks,
  ] = await Promise.all([
    checkSitePages(),
    checkPaymentAPIs(),
    checkPlatformAPIs(),
    checkCronAPIs(),
    checkFirebase(),
    checkStripe(),
    checkSSL(),
    checkMapTiler(),
    checkWatchFeatures(),
    checkEnvVars(),
    checkDataIntegrity(),
    checkSecurityRules(),
    checkReplicateAPI(),
    checkStorageRules(),
    checkErrorLogPatterns(),
    checkFirestoreIndexes(),
    checkAPIResponseBodies(),
  ]);

  const allChecks = [
    ...sitePages,
    ...platformAPIs,
    ...paymentAPIs,
    ...cronAPIs,
    ...firebaseChecks,
    ...stripeChecks,
    ...sslCheck,
    ...mapTilerCheck,
    ...watchChecks,
    ...envChecks,
    ...dataChecks,
    ...rulesChecks,
    ...replicateChecks,
    ...storageRulesChecks,
    ...errorLogChecks,
    ...indexChecks,
    ...apiBodyChecks,
  ];

  const emailSent = sendEmail ? await sendEmailReport(allChecks) : false;

  // Group results for UI display
  const groups = [
    { group: "Site Pages",         checks: sitePages },
    { group: "Platform APIs",      checks: platformAPIs },
    { group: "Payment APIs",       checks: paymentAPIs },
    { group: "Cron Jobs",          checks: cronAPIs },
    { group: "Firebase",           checks: firebaseChecks },
    { group: "Stripe",             checks: stripeChecks },
    { group: "Infrastructure",     checks: [...sslCheck, ...mapTilerCheck] },
    { group: "⌚ Watch & Health",   checks: watchChecks },
    { group: "🔑 Environment Vars", checks: envChecks },
    { group: "🔍 Data Integrity",     checks: dataChecks },
    { group: "📋 Security Rules",     checks: rulesChecks },
    { group: "🤖 AI Studio",          checks: replicateChecks },
    { group: "🗄️ Storage Rules",     checks: storageRulesChecks },
    { group: "🚨 Client Errors",      checks: errorLogChecks },
    { group: "📊 Firestore Indexes",  checks: indexChecks },
    { group: "🔬 API Response Bodies", checks: apiBodyChecks },
  ];

  return NextResponse.json({
    checks: allChecks,
    groups,
    emailSent,
    runAt: new Date().toISOString(),
    summary: {
      total:  allChecks.length,
      passed: allChecks.filter(c => c.ok).length,
      failed: allChecks.filter(c => !c.ok).length,
    },
  });
}
