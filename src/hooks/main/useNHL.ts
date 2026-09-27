"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import {
  nhlScheduleResponseSchema,
  nhlStandingsResponseSchema,
  NHL_STANDINGS_REFRESH_SECONDS,
  NHL_SCHEDULE_REFRESH_SECONDS,
  toNHLSeasonId,
  nhlGameResponseSchema,
} from "@gshl-utils/features/nhl";
import { useNav } from "./useNav";
import { useSeasons } from "./useSeason";

const cache = new Map<string, { data: unknown; checkedAt: number }>();

function useNHLResource<T>(
  url: string | null,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  refreshSeconds: number,
) {
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
    let lastAttempt = 0;
    async function refresh(force = false) {
      if (pending) return;
      const cached = cache.get(url!);
      if (
        !force &&
        cached &&
        Date.now() - cached.checkedAt < refreshSeconds * 1000
      ) {
        setResult({ url: url!, data: schema.parse(cached.data) });
        return;
      }
      if (!force && Date.now() - lastAttempt < refreshSeconds * 1000) return;
      lastAttempt = Date.now();
      pending = true;
      try {
        const response = await fetch(url!, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "NHL data is temporarily unavailable. Please try again.",
          );
        const data = schema.parse(await response.json());
        if (!controller.signal.aborted) {
          if (cache.size >= 32) cache.delete(cache.keys().next().value!);
          cache.set(url!, { data, checkedAt: Date.now() });
          setResult({ url: url!, data });
        }
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
    void refresh(attempt > 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, refreshSeconds * 1000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [url, schema, attempt, refreshSeconds]);
  const current = result?.url === url ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    isLoading: Boolean(url && !current),
    retry,
  };
}

export function useNHLSeason() {
  const { selectedSeasonId } = useNav();
  const seasons = useSeasons({
    seasonId: selectedSeasonId ?? undefined,
    enabled: Boolean(selectedSeasonId),
  });
  const selectedSeason = seasons.data.find(
    (season) => season.id === selectedSeasonId,
  );
  return {
    seasonId: toNHLSeasonId(selectedSeason?.year),
    selectedSeason,
    isLoading: seasons.isLoading,
  };
}

export function useNHLStandings(seasonId?: number) {
  return useNHLResource(
    seasonId ? `/api/nhl?view=standings&season=${seasonId}` : null,
    nhlStandingsResponseSchema,
    NHL_STANDINGS_REFRESH_SECONDS,
  );
}

export function useNHLSchedule(
  start?: string,
  end?: string,
  seasonId?: number,
) {
  return useNHLResource(
    start && end && seasonId
      ? `/api/nhl?view=schedule&season=${seasonId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      : null,
    nhlScheduleResponseSchema,
    NHL_SCHEDULE_REFRESH_SECONDS,
  );
}

export function useNHLGame(gameId: string) {
  return useNHLResource(
    /^\d{10}$/.test(gameId) ? `/api/nhl/game/${gameId}` : null,
    nhlGameResponseSchema,
    NHL_SCHEDULE_REFRESH_SECONDS,
  );
}
