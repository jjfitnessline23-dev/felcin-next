"use client";

const IS_CAP = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

async function getAuthToken(): Promise<string | undefined> {
  try {
    if (IS_CAP) {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      return (await FirebaseAuthentication.getIdToken()).token;
    }
    const { auth } = await import("@/lib/firebase");
    return await auth.currentUser?.getIdToken() ?? undefined;
  } catch { return undefined; }
}

export async function sendNotification(params: {
  recipientUid: string;
  type: string;
  senderName: string;
  senderId?: string;
  postId?: string;
  message?: string;
}) {
  try {
    const token = await getAuthToken();
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(params),
    });
  } catch {}
}

export async function sendLiveNotification(params: {
  hostUid: string;
  hostName: string;
  title?: string | null;
  privacy: string;
}) {
  try {
    const token = await getAuthToken();
    await fetch("/api/notify-live", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(params),
    });
  } catch {}
}
