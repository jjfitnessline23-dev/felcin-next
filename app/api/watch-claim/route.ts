export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const decoded = await app.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const ref = app.firestore().collection("watchPairings").doc(String(code));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Invalid code" }, { status: 404 });

    const data = snap.data()!;
    if (data.expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Code expired — get a new one on your Watch" }, { status: 410 });
    }

    await ref.update({ uid });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
