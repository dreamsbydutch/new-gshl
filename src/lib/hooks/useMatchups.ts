import type { Matchup } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

import { useQueryAdapter } from "./shared";

export function useAllMatchups() {
  const query = api.matchup.getAll.useQuery({ orderBy: { seasonId: "asc" } });
  return useQueryAdapter<Matchup[], Matchup[]>(query, {
    fallback: [],
    map: (data) => data ?? [],
  });
}

export function useMatchupById(matchupId: string | null | undefined) {
  const query = api.matchup.getById.useQuery(
    { id: String(matchupId ?? "") },
    { enabled: Boolean(matchupId) },
  );

  return useQueryAdapter<Matchup | null, Matchup | null>(query, {
    fallback: null,
    map: (data) => data ?? null,
  });
}

export function useMatchupsByWeekId(weekId: string | null | undefined) {
  const query = api.matchup.getAll.useQuery(
    weekId
      ? { where: { weekId: Number(weekId) }, orderBy: { seasonId: "asc" } }
      : { orderBy: { seasonId: "asc" } },
    { enabled: Boolean(weekId) },
  );

  return useQueryAdapter<Matchup[], Matchup[]>(query, {
    fallback: [],
    map: (data) => data ?? [],
  });
}

export function useMatchupsBySeasonId(seasonId: string | null | undefined) {
  const query = api.matchup.getAll.useQuery(
    seasonId
      ? { where: { seasonId: Number(seasonId) }, orderBy: { seasonId: "asc" } }
      : { orderBy: { seasonId: "asc" } },
    { enabled: Boolean(seasonId) },
  );

  return useQueryAdapter<Matchup[], Matchup[]>(query, {
    fallback: [],
    map: (data) => data ?? [],
  });
}
