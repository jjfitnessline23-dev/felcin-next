"use client";

// Computes the current user's workout streak from their logged activity
// (workouts + runs + rides) and persists it to their world-readable profile
// so it can appear on profiles / leaderboards later.

import { useEffect, useState, useCallback } from "react";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, serverTimestamp } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { computeStreak, dayKeyFromMs, msFromDateField, type StreakResult } from "@/lib/streak";

const EMPTY: StreakResult = { current: 0, longest: 0, activeToday: false, atRisk: false, lastActiveDay: null };

async function activeDaysForUser(uid: string): Promise<Set<string>> {
  const cols = ["workoutLogs", "runningRoutes", "cyclingRoutes"];
  const perCol = await Promise.all(
    cols.map(async (c) => {
      try {
        // orderBy+limit keeps this cheap and biased to recent days (what drives the streak).
        const snap = await getDocs(query(collection(db, "users", uid, c), orderBy("date", "desc"), limit(150)));
        return snap.docs;
      } catch { return []; }
    })
  );
  const days = new Set<string>();
  for (const docs of perCol) {
    for (const d of docs) {
      const ms = msFromDateField((d.data() as { date?: unknown }).date);
      if (ms !== null) days.add(dayKeyFromMs(ms));
    }
  }
  return days;
}

export function useStreak(): StreakResult & { loading: boolean; refresh: () => void } {
  const { user } = useAuth();
  const [result, setResult] = useState<StreakResult>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setResult(EMPTY); setLoading(false); return; }
    setLoading(true);
    try {
      const days = await activeDaysForUser(user.uid);
      const r = computeStreak(days);
      setResult(r);
      // Persist to public/profile, skipping redundant writes within a session.
      try {
        const cacheKey = `felcin_streak_${user.uid}`;
        const stamp = `${r.current}|${r.longest}|${r.lastActiveDay}`;
        if (sessionStorage.getItem(cacheKey) !== stamp) {
          sessionStorage.setItem(cacheKey, stamp);
          setDoc(
            doc(db, "users", user.uid, "public", "profile"),
            { currentStreak: r.current, longestStreak: r.longest, lastActiveDay: r.lastActiveDay, streakUpdatedAt: serverTimestamp() },
            { merge: true }
          ).catch(() => {});
        }
      } catch { /* sessionStorage unavailable */ }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...result, loading, refresh };
}
