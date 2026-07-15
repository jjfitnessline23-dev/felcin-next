export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

interface FreeExercise {
  id: string; name: string; equipment: string;
  primaryMuscles: string[]; secondaryMuscles: string[];
  category: string; level: string; images: string[];
}

let cachedDb: FreeExercise[] | null = null;
let cacheTime = 0;

async function getDb(): Promise<FreeExercise[]> {
  if (cachedDb && Date.now() - cacheTime < 86400000) return cachedDb;
  const res = await fetch(DB_URL, { next: { revalidate: 86400 } });
  cachedDb = await res.json();
  cacheTime = Date.now();
  return cachedDb!;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json([]);

  try {
    const db = await getDb();
    const results = db
      .filter((ex) => ex.name.toLowerCase().includes(q) || ex.primaryMuscles.some((m) => m.toLowerCase().includes(q)))
      .slice(0, 30)
      .sort((a, b) => {
        const aName = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bName = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aName - bName;
      })
      .slice(0, 20)
      .map((ex) => ({
        name: ex.name,
        target: ex.primaryMuscles[0] || ex.category,
        equipment: ex.equipment,
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
