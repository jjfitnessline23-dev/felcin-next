export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST() {
  try {
    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await app.firestore().collection("watchPairings").doc(code).set({
      uid: null,
      createdAt: new Date(),
      expiresAt,
    });

    return NextResponse.json({ code });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
