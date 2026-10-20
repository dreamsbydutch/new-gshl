"use client";

import { useMemo, useState } from "react";
import type { RecordPeriod, RecordSubject } from "@gshl-lib/types/records";
import type { PerformanceFilters } from "@gshl-lib/types/performances";
import {
  recordKind,
  recordDirection,
  recordRanks,
  recordStats,
} from "@gshl-utils/features/records";
import { usePerformances } from "../main/usePerformances";
import { useSeasonState } from "../main/useSeason";

export function useRecords() {
  const seasons = useSeasonState({ autoSelect: false });
  const [subject, setSubject] = useState<RecordSubject>("player");
  const [period, setPeriod] = useState<RecordPeriod>("career");
  const [stat, setStat] = useState("P");
  const [seasonId, setSeasonId] = useState("");
  const [seasonType, setSeasonType] = useState("RS");
  const [position, setPosition] =
    useState<PerformanceFilters["position"]>("all");
  const [minimumGames, setMinimumGames] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const kind = recordKind(subject, period);
  const stats = recordStats(kind);
  const selectedStat = stats.includes(stat) ? stat : "P";
  const rate = selectedStat === "GAA" || selectedStat === "SVP";
  const minimum =
    minimumGames ??
    (rate ? (period === "career" ? 20 : period === "season" ? 10 : 1) : 1);
  const allSeasonIds = useMemo(
    () => seasons.seasons.map((season) => season.id),
    [seasons.seasons],
  );
  const filters = useMemo<PerformanceFilters>(
    () => ({
      kind,
      stat: selectedStat,
      direction: recordDirection(selectedStat),
      seasonIds: period === "career" || !seasonId ? allSeasonIds : [seasonId],
      position: subject === "player" ? position : "all",
      seasonType,
      startDate: "",
      endDate: "",
      minimumGames: minimum,
    }),
    [
      kind,
      selectedStat,
      period,
      seasonId,
      allSeasonIds,
      subject,
      position,
      seasonType,
      minimum,
    ],
  );
  const query = usePerformances(
    filters,
    !seasons.isLoading && filters.seasonIds.length > 0,
  );
  const ranks = recordRanks(query.data?.rows ?? [], selectedStat);
  const needle = search.trim().toLocaleLowerCase();
  const rows = (query.data?.rows ?? [])
    .map((row, index) => ({ ...row, rank: ranks[index]! }))
    .filter(
      (row) =>
        !needle ||
        `${row.name} ${row.team}`.toLocaleLowerCase().includes(needle),
    );
  return {
    ...query,
    rows,
    subject,
    period,
    stat: selectedStat,
    stats,
    seasonId,
    seasonType,
    position,
    minimumGames: minimum,
    rate,
    search,
    seasons: seasons.seasons,
    isLoading: seasons.isLoading || query.isLoading,
    setSubject,
    setPeriod,
    setStat,
    setSeasonId,
    setSeasonType,
    setPosition,
    setMinimumGames,
    setSearch,
  };
}
