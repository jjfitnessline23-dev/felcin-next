export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, secret, steps, date } = body;

    const expectedSecret = process.env.WATCH_SYNC_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!uid || !date || typeof steps !== "number" || steps < 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    await app.firestore()
      .collection("users").doc(uid)
      .collection("steps").doc(date)
      .set({ steps, date, updatedAt: new Date() }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[save-steps]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
