/**
 * Admin ban / unban. The admin panel used to write `banned` to the target user's root doc
 * client-side, but rules only allow a user to update their OWN doc (no isAdmin exception),
 * so the write was denied + .catch-swallowed — the UI showed "banned" but it never
 * persisted and the user kept full access. This route does it with the Admin SDK after
 * verifying the caller is an owner. (`banned` is enforced in lib/auth.tsx → layout.tsx.)
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";

const OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2", "FoQAHsSnbdeHayMSl85wR5EliYm1"];

export async function POST(req: NextRequest) {
  const callerUid = await verifyToken(req.headers.get("authorization"));
  if (!callerUid || !OWNER_UIDS.includes(callerUid)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const { targetUid, banned } = body;
  if (!targetUid || typeof banned !== "boolean") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  await app.firestore().doc(`users/${targetUid}`).set({ banned }, { merge: true });
  return NextResponse.json({ ok: true, targetUid, banned });
}
