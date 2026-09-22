"use client";

import { useMemo, useState } from "react";
import { usePerformances } from "../main/usePerformances";
import { useSeasonState } from "../main/useSeason";
import type {
  PerformanceFilters,
  PerformanceKind,
  PerformanceColumnGroup,
} from "@gshl-lib/types/performances";
import {
  performanceDirection,
  performanceColumns,
  performanceStats,
} from "@gshl-utils/features/performances";

export function usePerformanceExplorer() {
  const seasons = useSeasonState();
  const [kind, setKind] = useState<PerformanceKind>("playerDay");
  const [columnGroup, setColumnGroup] = useState<PerformanceColumnGroup>("all");
  const [selectedSeasons, setSelectedSeasons] = useState<string[] | null>(null);
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
  const defaultSeasonId = seasons.selectedSeason?.id;
  const seasonIds = useMemo(
    () => selectedSeasons ?? (defaultSeasonId ? [defaultSeasonId] : []),
    [selectedSeasons, defaultSeasonId],
  );
  const filters = useMemo<PerformanceFilters>(
    () => ({
      kind,
      seasonIds,
      stat,
      direction,
      position: isPlayer ? position : "all",
      seasonType: hasSeasonType ? seasonType : "",
      startDate: isDaily ? startDate : "",
      endDate: isDaily ? endDate : "",
    }),
    [
      kind,
      seasonIds,
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
  const query = usePerformances(
    filters,
    seasonIds.length > 0 && !validationError,
  );
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
    visibleStats: performanceColumns(kind, columnGroup, stat),
    columnGroup,
    setColumnGroup,
    isDaily,
    isPlayer,
    hasSeasonType,
    validationError,
    selectKind,
    toggleSeason: (id: string) =>
      setSelectedSeasons(
        seasonIds.includes(id)
          ? seasonIds.filter((value) => value !== id)
          : [...seasonIds, id],
      ),
    selectAllSeasons: () =>
      setSelectedSeasons(seasons.seasons.map((season) => season.id)),
    clearSeasons: () => setSelectedSeasons([]),
    selectStat,
    setDirection,
    setPosition,
    setSeasonType,
    setStartDate,
    setEndDate,
  };
}
