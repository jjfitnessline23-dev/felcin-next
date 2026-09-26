export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// Daily "streak at risk" push. Finds users with a live workout streak who
// haven't logged today and nudges them to keep it alive before midnight.
//
// Source of truth is public/profile.{currentStreak,lastActiveDay}, which the
// client (useStreak) keeps updated. "Today" is evaluated in a fixed reference
// timezone (US Eastern, the primary market) — imperfect for far time zones;
// add per-user tz later for exact timing. Guarded by lastStreakReminder so a
// user is nudged at most once per day even if the cron is re-run.

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

const TZ = "America/New_York";
function dayKeyInTz(d: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD, matching the client's local day keys.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = getAdmin();
  if (!app) return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  const fdb = app.firestore();

  const today = dayKeyInTz(new Date(), TZ);

  // One profile doc per user lives at users/{uid}/public/profile. Scan them and
  // pick out at-risk streakers. (At current scale a full scan is fine; when the
  // user base grows, add a collection-group index on currentStreak + a where().)
  const snap = await fdb.collectionGroup("public").limit(5000).get();

  const atRisk: { uid: string; streak: number }[] = [];
  snap.forEach((docSnap) => {
    if (docSnap.id !== "profile") return;
    const d = docSnap.data() || {};
    const streak = Number(d.currentStreak || 0);
    if (streak < 1) return;
    if (d.lastActiveDay === today) return;       // already logged today
    if (d.lastStreakReminder === today) return;  // already nudged today
    const uid = docSnap.ref.parent.parent?.id;
    if (uid) atRisk.push({ uid, streak });
  });

  let sent = 0, noToken = 0, failed = 0;
  await Promise.allSettled(
    atRisk.map(async ({ uid, streak }) => {
      const tokDoc = await fdb.doc(`users/${uid}/pushTokens/web`).get();
      const fcmToken = tokDoc.exists ? (tokDoc.data() as { fcmToken?: string })?.fcmToken : null;
      if (!fcmToken) { noToken++; return; }

      const title = "🔥 Keep your streak alive!";
      const body = `You're on a ${streak}-day streak — log a workout today so you don't lose it.`;
      const link = "https://felcin.com/workouts";
      try {
        await app.messaging().send({
          token: fcmToken,
          data: { type: "streak", url: link, title, body, icon: "/static/logo-nav.svg" },
          webpush: { fcmOptions: { link } },
        });
        sent++;
        await fdb.doc(`users/${uid}/public/profile`).set({ lastStreakReminder: today }, { merge: true });
      } catch {
        failed++;
      }
    })
  );

  return NextResponse.json({ ok: true, tz: TZ, today, scanned: snap.size, candidates: atRisk.length, sent, noToken, failed });
}

// Vercel Cron triggers GET; POST kept for manual/consistency with other crons.
export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
