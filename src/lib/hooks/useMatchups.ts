import { clientApi as api } from "@gshl-trpc";

export function useAllMatchups() {
  const {
    data: matchups,
    isLoading,
    error,
  } = api.matchup.getAll.useQuery({ orderBy: { seasonId: "asc" } });
  return {
    data: matchups ?? [],
    isLoading,
    error,
  };
}

export function useMatchupById(matchupId: number) {
  const {
    data: matchup,
    isLoading,
    error,
  } = api.matchup.getById.useQuery({ id: matchupId });
  return {
    data: matchup ?? null,
    isLoading,
    error,
  };
}

export function useMatchupsByWeekId(weekId: number) {
  const {
    data: matchups,
    isLoading,
    error,
  } = api.matchup.getAll.useQuery({ where: { weekId } });
  return {
    data: matchups ?? [],
    isLoading,
    error,
  };
}
export function useMatchupsBySeasonId(seasonId: number) {
  const {
    data: matchups,
    isLoading,
    error,
  } = api.matchup.getAll.useQuery({ where: { seasonId } });
  return {
    data: matchups ?? [],
    isLoading,
    error,
  };
}
