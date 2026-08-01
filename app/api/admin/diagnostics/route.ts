export const dynamic = "force-dynamic";
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
  const [sitePages, paymentAPIs, platformAPIs, cronAPIs, firebaseChecks, stripeChecks, sslCheck, mapTilerCheck] = await Promise.all([
    checkSitePages(),
    checkPaymentAPIs(),
    checkPlatformAPIs(),
    checkCronAPIs(),
    checkFirebase(),
    checkStripe(),
    checkSSL(),
    checkMapTiler(),
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
