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

  const { recipientUid, type, senderName, postId, senderId, message } = await req.json().catch(() => ({}));
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
      repost: "New Repost",
      message: "New Message",
      tip: "New Tip",
      subscribe: "New Subscriber",
    };
    const bodies: Record<string, string> = {
      like: `${senderName} liked your post`,
      comment: `${senderName} commented on your post`,
      follow: `${senderName} started following you`,
      repost: `${senderName} reposted your reel`,
      message: message ? `${senderName}: ${message}` : `${senderName} sent you a message`,
      tip: `${senderName} sent you a tip`,
      subscribe: `${senderName} subscribed to you`,
    };

    const link = type === "message" && senderId
      ? `https://felcin.com/private-chats?uid=${senderId}`
      : postId
        ? `https://felcin.com/comments?postId=${postId}`
        : "https://felcin.com/";

    await app.messaging().send({
      token: fcmToken,
      data: {
        type,
        postId: postId || "",
        url: link,
        title: titles[type] || "Felcin",
        body: bodies[type] || `${senderName} interacted with you`,
        icon: "/static/logo-nav.svg",
      },
      webpush: {
        fcmOptions: { link },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
