"use client";

// Fire-and-forget view recorder. Replaces the old direct Firestore increments, which
// were denied by security rules (a viewer can't write the author's totalViews). The
// server route (/api/record-view) does the increments with the Admin SDK + per-viewer
// dedup. Safe to call on every view — the server no-ops duplicates and self-views.

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

export async function recordView(contentType: "post" | "reel", contentId: string): Promise<void> {
  try {
    const token = await getAuthToken();
    if (!token) return;
    await fetch("/api/record-view", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contentType, contentId }),
    });
  } catch { /* view counting is best-effort — never block the UI */ }
}
