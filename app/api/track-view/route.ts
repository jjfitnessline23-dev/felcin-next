export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import crypto from "crypto";

// Counts ONE website view per visitor per day (logged-out visitors included — they
// can't write analytics from the client, so this does it server-side via the Admin SDK).
// Deduped by hashed IP + date, so repeat visits / reloads the same day aren't double
// counted. Increments analytics/daily-<date>.visits and analytics/totals.visits.

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); return admin; }
  catch { return null; }
}

export async function POST(req: NextRequest) {
  const app = getAdmin();
  if (!app) return NextResponse.json({ ok: false }); // fail silent — never break a page view
  try {
    const db = app.firestore();
    const date = new Date().toISOString().split("T")[0]; // UTC day, matches existing analytics
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      || req.headers.get("x-real-ip") || "unknown";
    const key = crypto.createHash("sha256").update(`${ip}|${date}`).digest("hex").slice(0, 24);

    const vref = db.collection("webVisitors").doc(`${date}_${key}`);
    const snap = await vref.get();
    if (!snap.exists) {
      await vref.set({ date, at: admin.firestore.FieldValue.serverTimestamp() });
      await db.doc(`analytics/daily-${date}`).set({ visits: admin.firestore.FieldValue.increment(1) }, { merge: true });
      await db.doc("analytics/totals").set({ visits: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
