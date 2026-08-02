export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const snap = await app.firestore().collection("watchPairings").doc(code).get();
    if (!snap.exists) return NextResponse.json({ error: "Invalid code" }, { status: 404 });

    const data = snap.data()!;
    if (data.expiresAt.toDate() < new Date()) {
      return NextResponse.json({ expired: true });
    }
    if (data.uid) {
      return NextResponse.json({ uid: data.uid });
    }
    return NextResponse.json({ pending: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
