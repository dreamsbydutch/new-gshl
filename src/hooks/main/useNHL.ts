"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import {
  nhlScheduleSchema,
  nhlStandingsSchema,
} from "@gshl-utils/features/nhl";

function useNHLResource<T>(url: string | null, schema: z.ZodType<T>) {
  const [result, setResult] = useState<{
    url: string;
    data?: T;
    error?: string;
  }>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(url!, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            "NHL data is temporarily unavailable. Please try again.",
          );
        const data = schema.parse(await response.json());
        if (!controller.signal.aborted) setResult({ url: url!, data });
      } catch {
        if (!controller.signal.aborted)
          setResult((previous) => ({
            url: url!,
            data: previous?.url === url ? previous.data : undefined,
            error:
              "NHL data is temporarily unavailable. Displayed data may be out of date.",
          }));
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [url, schema, attempt]);
  const current = result?.url === url ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    isLoading: Boolean(url && !current),
    retry,
  };
}

export function useNHLStandings() {
  return useNHLResource("/api/nhl?view=standings", nhlStandingsSchema);
}

export function useNHLSchedule(start?: string, end?: string) {
  return useNHLResource(
    start && end
      ? `/api/nhl?view=schedule&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      : null,
    nhlScheduleSchema,
  );
}
