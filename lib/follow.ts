"use client";

// Client helper for follow / unfollow. The actual writes (relationship docs + both
// counters) happen server-side in /api/follow with the Admin SDK — a viewer can't write
// the followed user's followersCount directly (rules deny it), which is why the counter
// used to never grow. Returns true if the request succeeded.

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

export async function followRequest(targetUid: string, action: "follow" | "unfollow"): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (!token) return false;
    const res = await fetch("/api/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUid, action }),
    });
    return res.ok;
  } catch { return false; }
}
