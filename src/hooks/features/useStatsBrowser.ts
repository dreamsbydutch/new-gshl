"use client";

import { useMemo } from "react";
import {
  useAppRouter,
  useAppSearchParams,
  useSeasonState,
  useTeams,
  useWeeks,
} from "../main";
import { useStats } from "../main/useStats";
import { useStatsNavigation } from "../main/useNav";
import type { StatsFilters } from "@gshl-lib/types/stats-browser";
import { statsColumns } from "@gshl-utils/features/stats-browser";

export function useStatsBrowser() {
  const { search } = useAppSearchParams();
  useStatsNavigation(search);
  const { replaceInPlace } = useAppRouter();
  const seasons = useSeasonState({ autoSelect: false });
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const selected =
    seasons.seasons.find((season) => season.id === query.get("season")) ??
    seasons.currentSeason ??
    seasons.defaultSeason;
  const teams = useTeams({
    seasonId: selected?.id,
    enabled: Boolean(selected),
  });
  const weeks = useWeeks({
    seasonId: selected?.id,
    enabled: Boolean(selected),
  });
  const filters = useMemo<StatsFilters>(() => {
    const position = query.get("position") ?? "skater";
    const validPosition =
      (["skater", "goalie", "C", "LW", "RW", "D"] as const).find(
        (item) => item === position,
      ) ?? "skater";
    const columns = statsColumns(validPosition);
    const stat =
      columns.find((item) => item === query.get("sort")) ??
      (validPosition === "goalie" ? "W" : "P");
    return {
      seasonId: selected?.id ?? "",
      position: validPosition,
      stat,
      direction: query.get("order") === "asc" ? "asc" : "desc",
      seasonType:
        query.get("type") === "PO"
          ? "PO"
          : query.get("type") === "LT"
            ? "LT"
            : "RS",
      weekId: weeks.data.find((week) => week.id === query.get("week"))?.id,
      teamId: teams.data.find((team) => team.id === query.get("team"))?.id,
      page: Math.max(
        0,
        Math.min(10000, Math.trunc(Number(query.get("page")) || 0)),
      ),
    };
  }, [query, selected?.id, teams.data, weeks.data]);
  const result = useStats(
    filters,
    Boolean(selected) && !teams.isLoading && !weeks.isLoading,
  );
  const change = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    next.delete("page");
    next.delete("player");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    replaceInPlace(`/stats?${next}`);
  };
  return {
    ...result,
    filters,
    seasons: seasons.seasons,
    selected,
    teams: teams.data,
    weeks: weeks.data,
    columns: statsColumns(filters.position),
    change,
    selectedPlayer: query.get("player"),
    selectPlayer: (id: string) => {
      const next = new URLSearchParams(search);
      if (next.get("player") === id) next.delete("player");
      else next.set("player", id);
      replaceInPlace(`/stats?${next}`);
    },
    selectStat: (stat: string) =>
      change({
        sort: stat,
        order:
          filters.stat === stat
            ? filters.direction === "desc"
              ? "asc"
              : "desc"
            : stat === "GAA"
              ? "asc"
              : "desc",
      }),
    isLoading:
      seasons.isLoading ||
      teams.isLoading ||
      weeks.isLoading ||
      Boolean(selected && !result.data && !result.error),
  };
}
