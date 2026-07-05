export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

interface FreeExercise {
  id: string;
  name: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  level: string;
  images: string[];
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
  const type = req.nextUrl.searchParams.get("type") || "bodyweight";

  try {
    const db = await getDb();

    let filtered: FreeExercise[];
    if (type === "bodyweight") {
      filtered = db.filter((e) =>
        e.equipment === "body only" && e.images.length > 0
      );
    } else {
      filtered = db.filter((e) =>
        ["barbell", "dumbbell", "kettlebells", "cable"].includes(e.equipment) && e.images.length > 0
      );
    }

    // Shuffle and pick 16
    const shuffled = filtered.sort(() => 0.5 - Math.random()).slice(0, 16);

    return NextResponse.json(
      shuffled.map((e) => ({
        name: e.name,
        image: null, // no human photos — animated GIFs come from ExerciseDB
        target: e.primaryMuscles[0] || "",
        equipment: e.equipment,
        level: e.level,
      }))
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
