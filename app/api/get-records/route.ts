export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid    = searchParams.get("uid") ?? "";
    const secret = searchParams.get("secret") ?? "";

    const expectedSecret = process.env.WATCH_SYNC_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });
    const db = app.firestore();

    const [runsSnap, cyclesSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("runningRoutes").limit(500).get(),
      db.collection("users").doc(uid).collection("cyclingRoutes").limit(500).get(),
    ]);

    const runs   = runsSnap.docs.map(d => d.data());
    const cycles = cyclesSnap.docs.map(d => d.data());

    const validRuns   = runs.filter(r => (r.distance ?? 0) > 100);
    const validCycles = cycles.filter(c => (c.distance ?? 0) > 100);

    const bestRunDist = validRuns.reduce((m, r) => Math.max(m, r.distance ?? 0), 0);
    const bestRunPace = validRuns
      .filter(r => r.avgPace > 0 && r.distance >= 500)
      .reduce((m, r) => (r.avgPace < m ? r.avgPace : m), Infinity);

    const bestCycleDist = validCycles.reduce((m, c) => Math.max(m, c.distance ?? 0), 0);
    const bestCycleSpeed = validCycles
      .filter(c => c.duration > 0)
      .reduce((m, c) => {
        const spd = (c.distance ?? 0) / c.duration;
        return spd > m ? spd : m;
      }, 0);

    return NextResponse.json({
      run: {
        bestDist: bestRunDist,
        bestPace: isFinite(bestRunPace) ? bestRunPace : 0,
      },
      cycle: {
        bestDist:  bestCycleDist,
        bestSpeed: bestCycleSpeed,
      },
    });
  } catch (e: any) {
    console.error("[get-records]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
