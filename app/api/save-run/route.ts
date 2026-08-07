export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const decoded = await app.auth().verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const uid = decoded.uid;
    const { distance, duration, avgPace, coordinates, name, activityType } = await req.json();

    if (duration === undefined || duration === null) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const db = app.firestore();
    const col = activityType === "cycle" ? "cyclingRoutes" : "runningRoutes";

    // Calculate PRs server-side
    const existing = await db.collection("users").doc(uid).collection(col).limit(500).get();
    const routes = existing.docs.map(d => d.data());
    const maxDist  = routes.reduce((m, r) => Math.max(m, r.distance || 0), 0);
    const bestPace = routes.filter(r => r.avgPace > 0 && r.distance >= 500)
                           .reduce((m, r) => Math.min(m, r.avgPace), Infinity);

    const isDistancePR = distance > 100 && distance > maxDist;
    const isPacePR     = distance >= 500 && avgPace > 0 && avgPace < bestPace;

    const ref = await db.collection("users").doc(uid).collection(col).add({
      distance, duration, avgPace: avgPace || 0,
      name: name || "Run",
      coordinates: coordinates || [],
      date: new Date(),
      isDistancePR, isPacePR,
      source: "app",
    });

    return NextResponse.json({ ok: true, id: ref.id, isDistancePR, isPacePR });
  } catch (e: any) {
    console.error("[save-run]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
