export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, secret, distance, duration, avgPace, coordinates, name, activityType, calories, heartRate } = body;

    // Validate shared secret
    const expectedSecret = process.env.WATCH_SYNC_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!uid || typeof distance !== "number" || typeof duration !== "number" || duration <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const db = app.firestore();

    // Load existing runs to calculate PRs
    const col = activityType === "cycle" ? "cyclingRoutes" : "runningRoutes";
    const existing = await db.collection("users").doc(uid).collection(col).limit(500).get();
    const routes = existing.docs.map(d => d.data());

    const maxDist  = routes.reduce((m, r) => Math.max(m, r.distance || 0), 0);
    const bestPace = routes.filter(r => r.avgPace > 0 && r.distance >= 500)
                           .reduce((m, r) => Math.min(m, r.avgPace), Infinity);

    const isDistancePR = distance > 100 && distance > maxDist;
    const isPacePR     = distance >= 500 && avgPace > 0 && avgPace < bestPace;

    const docData = {
      distance,
      duration,
      avgPace:      avgPace || 0,
      name:         name || "Watch Run",
      coordinates:  coordinates || [],
      date:         new Date(),
      isDistancePR,
      isPacePR,
      source:       "apple_watch",
      calories:     calories || 0,
      heartRate:    heartRate || 0,
      activityType: activityType || "run",
    };

    const ref = await db.collection("users").doc(uid).collection(col).add(docData);

    return NextResponse.json({ ok: true, id: ref.id, isDistancePR, isPacePR });
  } catch (e: any) {
    console.error("[save-watch-run]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
