"use client";
import { useEffect, useState } from "react";
import type { MatchupRecords } from "@gshl-lib/types/performance-records";
import { recordWindow } from "@gshl-utils/features/performance-records";

export function useMatchupRecords(
  matchupId: string,
  start?: string | null,
  end?: string | null,
) {
  const [clock, setClock] = useState(() => Date.now());
  const [result, setResult] = useState<{
    id: string;
    data: MatchupRecords;
  } | null>(null);
  const enabled = recordWindow(start, end, clock);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 300_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch("/api/matchup/" + encodeURIComponent(matchupId) + "/records", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Comparison unavailable");
        const data = (await response.json()) as MatchupRecords;
        if (!controller.signal.aborted) setResult({ id: matchupId, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult(null);
      });
    return () => controller.abort();
  }, [matchupId, enabled, clock]);
  return enabled && result?.id === matchupId ? result.data : null;
}
