// Workout-streak computation — pure, testable, no I/O.
// A "streak day" is any local calendar day the user logged a workout, run, or ride.

const DAY_MS = 86400000;

/** Local calendar day key, e.g. "2026-10-31". Uses local time so a user's
 *  midnight matches their device, not UTC. */
export function dayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface StreakResult {
  current: number;      // consecutive days ending today (or yesterday if today not done yet)
  longest: number;      // best run ever across recorded days
  activeToday: boolean; // logged something today
  atRisk: boolean;      // has a live streak but hasn't logged today
  lastActiveDay: string | null;
}

/** Compute streak stats from a set of active day keys. */
export function computeStreak(activeDayKeys: Iterable<string>, now: number = Date.now()): StreakResult {
  const set = new Set(activeDayKeys);
  const todayK = dayKeyFromMs(now);
  const activeToday = set.has(todayK);

  // Count back from today if active, else from yesterday if that was active
  // (streak still "alive" today, just at risk until they log).
  let anchor: number | null = null;
  if (activeToday) anchor = now;
  else if (set.has(dayKeyFromMs(now - DAY_MS))) anchor = now - DAY_MS;

  let current = 0;
  if (anchor !== null) {
    let cursor = anchor;
    while (set.has(dayKeyFromMs(cursor))) { current++; cursor -= DAY_MS; }
  }

  // Longest run across all recorded days.
  const sorted = Array.from(set).sort();
  let longest = 0, run = 0, prevMs: number | null = null;
  for (const k of sorted) {
    const ms = new Date(`${k}T00:00:00`).getTime();
    if (prevMs !== null && Math.round((ms - prevMs) / DAY_MS) === 1) run++;
    else run = 1;
    if (run > longest) longest = run;
    prevMs = ms;
  }
  longest = Math.max(longest, current);

  return {
    current,
    longest,
    activeToday,
    atRisk: current > 0 && !activeToday,
    lastActiveDay: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

/** Robustly pull a millisecond timestamp from a Firestore date field that may be
 *  a Timestamp, a {seconds} object, an ISO string, or a Date. Returns null if unusable. */
export function msFromDateField(date: any): number | null {
  if (date == null) return null;
  if (typeof date?.toMillis === "function") return date.toMillis();
  if (typeof date?.seconds === "number") return date.seconds * 1000;
  const t = new Date(date).getTime();
  return Number.isFinite(t) ? t : null;
}
