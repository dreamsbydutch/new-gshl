"use client";

import { useEffect, useState } from "react";
import { lastNightDate } from "@gshl-utils/features/lineup-shame";
import { useLineupShameStats } from "../main/useLineupShameStats";

export function useLineupShame(seasonId: string) {
  const [recentDate, setRecentDate] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setRecentDate(lastNightDate(new Date()));
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return useLineupShameStats(seasonId, recentDate);
}
