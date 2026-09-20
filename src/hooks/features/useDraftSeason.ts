"use client";

import { useMemo } from "react";
import type { UseSeasonStateOptions } from "@gshl-types";
import { resolveDraftHubSeason } from "@gshl-utils/features/draft-hub";
import { useSeasonState } from "../main/useSeason";

/** Public boards opt out of navigation writes while using the same real draft season. */
export function useDraftSeason(options: UseSeasonStateOptions = {}) {
  const { seasons, isLoading } = useSeasonState(options);
  const season = useMemo(
    () => resolveDraftHubSeason(seasons, options.referenceDate),
    [seasons, options.referenceDate],
  );
  return { seasons, season, isLoading };
}
