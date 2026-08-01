/**
 * Felcin transactional email system
 * Sender: noreply@felcin.com  (requires felcin.com verified in Resend dashboard)
 * Provider: Resend  (RESEND_API_KEY in Vercel env)
 */
import { getAdminApp } from "./firebaseAdmin";

const FROM    = "Felcin <noreply@felcin.com>";
const SUPPORT = "support@felcin.com";
const LOGO    = "https://www.felcin.com/logo192.png";
const BASE    = "https://felcin.com";

// ─── get user email from Firebase Auth ────────────────────────────────────────
export async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const app = getAdminApp();
    if (!app) return null;
    const user = await app.auth().getUser(uid);
    return user.email ?? null;
  } catch { return null; }
}

// ─── send via Resend ──────────────────────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[email] send failed:", err);
    }
    return res.ok;
  } catch (e: any) {
    console.error("[email] error:", e.message);
    return false;
  }
}

// ─── shared HTML wrapper ──────────────────────────────────────────────────────
function wrap(title: string, accentColor: string, icon: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#13131e;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0d0d1a,#161628);padding:28px 28px 20px;text-align:center;border-bottom:1px solid #1e1e2e;">
        <img src="${LOGO}" width="44" height="44" alt="Felcin" style="border-radius:12px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;">
        <div style="font-size:28px;margin-bottom:8px;">${icon}</div>
        <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">${title}</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:24px 28px;">${body}</td></tr>

      <!-- Footer -->
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #1e1e2e;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#374151;">
          Questions? <a href="mailto:${SUPPORT}" style="color:${accentColor};text-decoration:none;">Contact Support</a>
        </p>
        <p style="margin:0;font-size:11px;color:#1f2937;">
          <a href="${BASE}" style="color:#374151;text-decoration:none;">felcin.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function row(label: string, value: string, color = "#e2e8f0"): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #1e1e2e;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:${color};font-weight:600;text-align:right;border-bottom:1px solid #1e1e2e;">${value}</td>
  </tr>`;
}

function ctaButton(text: string, href: string, color: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:13px 28px;background:${color};color:#fff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">${text}</a>`;
}

// ─── email templates ──────────────────────────────────────────────────────────

export function badgeConfirmationEmail(badgeLabel: string, badgeId: string, amountUsd: number): string {
  const accent = "#a78bfa";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your <strong style="color:${accent};">${badgeLabel}</strong> badge is now live on your Felcin profile.
      It will appear next to your name on all posts, comments, and your profile page.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Badge",   badgeLabel, accent)}
      ${row("Amount",  `$${amountUsd.toFixed(2)}`)}
      ${row("Status",  "✅ Active")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("View Your Profile", `${BASE}/profile`, accent)}
    </div>`;
  return wrap(`${badgeLabel} Badge Activated`, accent, "🏆", body);
}

export function subscriptionConfirmationEmail(creatorName: string, tier: string, amountUsd: number): string {
  const accent = "#34d399";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      You're now subscribed to <strong style="color:${accent};">${creatorName}</strong> on Felcin.
      You have full access to their exclusive content.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Creator",  creatorName, accent)}
      ${row("Tier",     tier)}
      ${row("Amount",   `$${amountUsd.toFixed(2)}/mo`)}
      ${row("Status",   "✅ Active")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("View Creator", `${BASE}/profile`, accent)}
    </div>`;
  return wrap(`Subscribed to ${creatorName}`, accent, "⭐", body);
}

export function tipConfirmationEmail(creatorName: string, amountUsd: number): string {
  const accent = "#fbbf24";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your tip of <strong style="color:${accent};">$${amountUsd.toFixed(2)}</strong> has been sent
      to <strong>${creatorName}</strong>. Thanks for supporting creators on Felcin!
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Recipient", creatorName, accent)}
      ${row("Amount",    `$${amountUsd.toFixed(2)}`)}
      ${row("Status",    "✅ Delivered")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("Explore Creators", `${BASE}/explore`, accent)}
    </div>`;
  return wrap(`Tip Sent to ${creatorName}`, accent, "💸", body);
}

export function ppvConfirmationEmail(creatorName: string, amountUsd: number): string {
  const accent = "#60a5fa";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      You've unlocked exclusive content from <strong style="color:${accent};">${creatorName}</strong>.
      Head back to the app to watch it.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Creator",  creatorName, accent)}
      ${row("Amount",   `$${amountUsd.toFixed(2)}`)}
      ${row("Status",   "🔓 Unlocked")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("Open Felcin", BASE, accent)}
    </div>`;
  return wrap("Content Unlocked", accent, "🔓", body);
}

export function giftConfirmationEmail(recipientName: string, amountUsd: number): string {
  const accent = "#f472b6";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your gift of <strong style="color:${accent};">$${amountUsd.toFixed(2)}</strong> has been
      delivered to <strong>${recipientName}</strong> on Felcin. 🎁
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Recipient", recipientName, accent)}
      ${row("Amount",    `$${amountUsd.toFixed(2)}`)}
      ${row("Status",    "✅ Delivered")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("Open Felcin", BASE, accent)}
    </div>`;
  return wrap("Gift Delivered", accent, "🎁", body);
}

export function boostConfirmationEmail(amountUsd: number): string {
  const accent = "#fb923c";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your post boost is now live! Your content is being promoted across Felcin to reach more users.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Type",    "Post Boost", accent)}
      ${row("Amount",  `$${amountUsd.toFixed(2)}`)}
      ${row("Status",  "🚀 Active")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("View Your Posts", `${BASE}/profile`, accent)}
    </div>`;
  return wrap("Post Boost Active", accent, "🚀", body);
}

export function premiumConfirmationEmail(tier: string, amountUsd: number): string {
  const accent = "#a78bfa";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Welcome to <strong style="color:${accent};">Felcin Premium ${tier}</strong>!
      You now have access to all premium features across the platform.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Plan",    `Premium ${tier}`, accent)}
      ${row("Amount",  `$${amountUsd.toFixed(2)}/mo`)}
      ${row("Status",  "✅ Active")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("Explore Felcin", BASE, accent)}
    </div>`;
  return wrap("Premium Activated", accent, "⚡", body);
}

export function trainingSessionConfirmationEmail(trainerName: string, amountUsd: number): string {
  const accent = "#34d399";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your training session with <strong style="color:${accent};">${trainerName}</strong> has been booked and paid.
      Check the app for session details.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Trainer",  trainerName, accent)}
      ${row("Amount",   `$${amountUsd.toFixed(2)}`)}
      ${row("Status",   "✅ Booked")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("Open Felcin", BASE, accent)}
    </div>`;
  return wrap(`Training Session Booked`, accent, "💪", body);
}

export function adConfirmationEmail(amountUsd: number): string {
  const accent = "#fb923c";
  const body = `
    <p style="font-size:15px;color:#e2e8f0;margin:0 0 20px;line-height:1.6;">
      Your ad campaign on Felcin is now live and reaching users across the platform.
    </p>
    <table width="100%" style="border-collapse:collapse;">
      ${row("Type",    "Ad Campaign", accent)}
      ${row("Amount",  `$${amountUsd.toFixed(2)}`)}
      ${row("Status",  "📢 Live")}
    </table>
    <div style="text-align:center;">
      ${ctaButton("View Dashboard", `${BASE}/dashboard`, accent)}
    </div>`;
  return wrap("Ad Campaign Live", accent, "📢", body);
}
