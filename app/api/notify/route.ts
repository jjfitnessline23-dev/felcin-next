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

export async function POST(req: NextRequest) {
  const app = getAdmin();
  if (!app) return NextResponse.json({ ok: false, error: "no admin" });

  const { recipientUid, type, senderName, postId } = await req.json().catch(() => ({}));
  if (!recipientUid || !type) return NextResponse.json({ ok: false });

  try {
    const tokenDoc = await app.firestore()
      .doc(`users/${recipientUid}/pushTokens/web`).get();
    if (!tokenDoc.exists) return NextResponse.json({ ok: false, reason: "no token" });

    const { fcmToken } = tokenDoc.data() || {};
    if (!fcmToken) return NextResponse.json({ ok: false, reason: "no fcm token" });

    const titles: Record<string, string> = {
      like: "New Like",
      comment: "New Comment",
      follow: "New Follower",
    };
    const bodies: Record<string, string> = {
      like: `${senderName} liked your post`,
      comment: `${senderName} commented on your post`,
      follow: `${senderName} started following you`,
    };

    await app.messaging().send({
      token: fcmToken,
      notification: {
        title: titles[type] || "Felcin",
        body: bodies[type] || `${senderName} interacted with you`,
      },
      data: { type, postId: postId || "", url: postId ? `/comments?postId=${postId}` : "/" },
      webpush: {
        notification: { icon: "/static/logo-nav.svg" },
        fcmOptions: { link: postId ? `/comments?postId=${postId}` : "/" },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
