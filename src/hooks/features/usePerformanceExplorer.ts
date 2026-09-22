"use client";

import { useMemo, useState } from "react";
import { usePerformances } from "../main/usePerformances";
import { useSeasonState } from "../main/useSeason";
import type {
  PerformanceFilters,
  PerformanceKind,
} from "@gshl-lib/types/performances";
import {
  performanceDirection,
  performanceStats,
} from "@gshl-utils/features/performances";

export function usePerformanceExplorer() {
  const seasons = useSeasonState();
  const [kind, setKind] = useState<PerformanceKind>("playerDay");
  const [season, setSeason] = useState("");
  const [stat, setStat] = useState("Rating");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [position, setPosition] =
    useState<PerformanceFilters["position"]>("all");
  const [seasonType, setSeasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const isDaily = kind.endsWith("Day");
  const hasSeasonType = ["playerSplit", "playerTotal", "teamSeason"].includes(
    kind,
  );
  const isPlayer = kind.startsWith("player");
  const seasonId = season || (seasons.selectedSeason?.id ?? "");
  const filters = useMemo<PerformanceFilters>(
    () => ({
      kind,
      seasonId,
      stat,
      direction,
      position: isPlayer ? position : "all",
      seasonType: hasSeasonType ? seasonType : "",
      startDate: isDaily ? startDate : "",
      endDate: isDaily ? endDate : "",
    }),
    [
      kind,
      seasonId,
      stat,
      direction,
      position,
      isPlayer,
      hasSeasonType,
      seasonType,
      isDaily,
      startDate,
      endDate,
    ],
  );
  const validationError =
    isDaily && startDate && endDate && startDate > endDate
      ? "Start date must be on or before end date."
      : null;
  const query = usePerformances(filters, Boolean(seasonId) && !validationError);
  function selectStat(next: string) {
    setStat(next);
    setDirection(
      next === stat
        ? direction === "desc"
          ? "asc"
          : "desc"
        : performanceDirection(next),
    );
  }
  function selectKind(next: PerformanceKind) {
    setKind(next);
    if (!performanceStats(next).includes(stat)) {
      setStat(performanceStats(next)[0]!);
      setDirection("desc");
    }
  }
  return {
    ...query,
    seasons: seasons.seasons,
    seasonsLoading: seasons.isLoading,
    filters,
    stats: performanceStats(kind),
    isDaily,
    isPlayer,
    hasSeasonType,
    validationError,
    selectKind,
    setSeason,
    selectStat,
    setDirection,
    setPosition,
    setSeasonType,
    setStartDate,
    setEndDate,
  };
}
