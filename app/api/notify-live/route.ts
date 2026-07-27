export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

async function verifyToken(req: NextRequest, app: typeof admin) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) return null;
  try { return await app.auth().verifyIdToken(token); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const app = getAdmin();
  if (!app) return NextResponse.json({ ok: false });

  const caller = await verifyToken(req, app);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { hostUid, hostName, title, privacy } = await req.json().catch(() => ({}));
  if (!hostUid) return NextResponse.json({ ok: false });

  // Caller must be the host they claim to be
  if (caller.uid !== hostUid) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    // Get all followers of the host
    const followersSnap = await app.firestore()
      .collection(`users/${hostUid}/followers`).get();

    if (followersSnap.empty) return NextResponse.json({ ok: true, sent: 0 });

    const body = title
      ? `${hostName} is live: ${title}`
      : `${hostName} just went live`;

    // Send notifications to all followers in parallel (batch of 20)
    const followerIds = followersSnap.docs.map((d) => d.id);
    let sent = 0;

    await Promise.all(
      followerIds.map(async (uid) => {
        try {
          const tokenDoc = await app.firestore()
            .doc(`users/${uid}/pushTokens/web`).get();
          if (!tokenDoc.exists) return;
          const { fcmToken } = tokenDoc.data() || {};
          if (!fcmToken) return;

          await app.messaging().send({
            token: fcmToken,
            notification: { title: "🔴 Live Now", body },
            data: { type: "live", hostUid, url: `/live/${hostUid}` },
            webpush: {
              notification: { icon: "/static/logo-nav.svg", badge: "/static/logo-nav.svg" },
              fcmOptions: { link: `/live/${hostUid}` },
            },
          });
          sent++;
        } catch {}
      })
    );

    return NextResponse.json({ ok: true, sent });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
