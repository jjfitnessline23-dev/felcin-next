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

// Noise words that add no signal for matching
const NOISE = new Set([
  "exercise","exercises","workout","workouts","training","drill","drills",
  "move","movement","routine","session","do","a","an","the","my","some","and","or",
]);

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .split(/[\s\-\/,()]+/)
    .map((w) => w.replace(/s$/, "")) // naive singular
    .filter((w) => w.length > 1 && !NOISE.has(w));
}

function scoreExercise(ex: FreeExercise, queryTokens: string[]): number {
  const nameTokens = tokenize(ex.name);
  const muscleTokens = [
    ...ex.primaryMuscles.flatMap((m) => tokenize(m)),
    ...ex.secondaryMuscles.flatMap((m) => tokenize(m)),
    ...tokenize(ex.category),
  ];

  let total = 0;
  for (const qt of queryTokens) {
    if (nameTokens.some((nt) => nt === qt)) {
      total += 10; // exact name token match
    } else if (nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt))) {
      total += 6; // prefix match in name
    } else if (muscleTokens.some((mt) => mt === qt || mt.startsWith(qt) || qt.startsWith(mt))) {
      total += 3; // muscle / category match
    }
  }
  return total;
}

function findBestExercise(db: FreeExercise[], query: string): FreeExercise | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;

  let best: FreeExercise | null = null;
  let bestScore = 0;

  for (const ex of db) {
    const s = scoreExercise(ex, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = ex;
    }
  }

  return bestScore >= 3 ? best : null;
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  // Try ExerciseDB animated GIFs first
  const apiKey = process.env.EXERCISEDB_API_KEY;
  if (apiKey) {
    try {
      const cleanName = name.toLowerCase().trim();
      const res = await fetch(
        `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(cleanName)}?limit=5`,
        { headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": "exercisedb.p.rapidapi.com" }, next: { revalidate: 86400 } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.length) {
          // Pick the best result by scoring against query tokens
          const queryTokens = tokenize(name);
          const scored = (data as { name: string; gifUrl: string; target: string; bodyPart: string; equipment: string; instructions: string[]; secondaryMuscles: string[] }[])
            .map((ex) => ({ ex, s: scoreExercise({ name: ex.name, primaryMuscles: [ex.target], secondaryMuscles: ex.secondaryMuscles, category: ex.bodyPart, equipment: ex.equipment, instructions: [], images: [], id: "", level: "" }, queryTokens) }))
            .sort((a, b) => b.s - a.s);
          const ex = scored[0].ex;
          return NextResponse.json({
            name: ex.name, gifUrl: ex.gifUrl, gifUrl2: null,
            target: ex.target, bodyPart: ex.bodyPart, equipment: ex.equipment,
            instructions: ex.instructions || [], secondaryMuscles: ex.secondaryMuscles || [],
            isAnimated: true,
          });
        }
      }
    } catch {}
  }

  // Fallback — free exercise DB
  try {
    const db = await getDb();
    const ex = findBestExercise(db, name);
    if (!ex) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      name: ex.name,
      gifUrl: ex.images[0] ? `${IMG_BASE}/${ex.id}/${ex.images[0]}` : null,
      gifUrl2: ex.images[1] ? `${IMG_BASE}/${ex.id}/${ex.images[1]}` : null,
      target: ex.primaryMuscles[0] || ex.category,
      bodyPart: ex.category,
      equipment: ex.equipment,
      instructions: ex.instructions || [],
      secondaryMuscles: ex.secondaryMuscles || [],
      isAnimated: false,
      noVideo: false,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
