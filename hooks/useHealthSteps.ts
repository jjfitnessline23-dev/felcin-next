"use client";
import { useState, useEffect } from "react";

export interface DaySteps { date: string; steps: number; }

export function useHealthSteps() {
  const [steps, setSteps] = useState<number | null>(null);
  const [weekly, setWeekly] = useState<DaySteps[]>([]);
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const HK = (window as any).HealthKit;
    if (!HK) { setLoading(false); return; }

    (async () => {
      try {
        const auth = await HK.requestAuthorization();
        if (!auth?.granted) { setLoading(false); return; }
        setGranted(true);

        const [todayRes, weekRes] = await Promise.all([
          HK.getSteps(),
          HK.getWeeklySteps(),
        ]);

        if (typeof todayRes?.steps === "number") setSteps(todayRes.steps);
        if (Array.isArray(weekRes?.days)) setWeekly(weekRes.days);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return { steps, weekly, granted, loading };
}
