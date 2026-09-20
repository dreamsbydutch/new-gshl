import type {
  GSHLTeam,
  NHLTeam,
  Franchise,
  TeamDayStatLine,
  TeamWeekStatLine,
  TeamSeasonStatLine,
} from "../src/lib/types";
import {
  useTeams,
  useNHLTeams,
  useFranchises,
  useTeamDayStats,
  useTeamWeekStats,
  useTeamSeasonStats,
} from "../src/hooks/main/useTeam";
import { useSeasonDataBundle } from "../src/hooks/features/useSeasonDataBundle";
import { usePlayers } from "../src/hooks/main/usePlayer";
import { useSeasons } from "../src/hooks/main/useSeason";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
function expectType<T extends true>(value: T) {
  return value;
}

// Compile-only fixture; never mounted.
export function useReadTypeFixture() {
  const teams = useTeams();
  const nhl = useNHLTeams();
  const franchises = useFranchises();
  const daily = useTeamDayStats();
  const weekly = useTeamWeekStats();
  const seasons = useTeamSeasonStats();
  const bundle = useSeasonDataBundle({ includeSeasonStats: true });
  expectType<Equal<typeof teams.data, GSHLTeam[]>>(true);
  expectType<Equal<typeof nhl.data, NHLTeam[]>>(true);
  expectType<Equal<typeof franchises.data, Franchise[]>>(true);
  expectType<Equal<typeof daily.data, TeamDayStatLine[]>>(true);
  expectType<Equal<typeof weekly.data, TeamWeekStatLine[]>>(true);
  expectType<Equal<typeof seasons.data, TeamSeasonStatLine[]>>(true);
  expectType<Equal<typeof bundle.teamStats, TeamSeasonStatLine[]>>(true);
  // @ts-expect-error A team read cannot request a different domain.
  useTeams({ teamType: "nhl" });
  // @ts-expect-error Team rows cannot request statistics.
  useTeams({ statsLevel: "season" });
  // @ts-expect-error NHL teams do not belong to a GSHL season.
  useNHLTeams({ seasonId: "season" });
  // @ts-expect-error Franchises are not season-specific team instances.
  useFranchises({ seasonId: "season" });
  // @ts-expect-error Daily statistics cannot be requested by week.
  useTeamDayStats({ weekId: "week" });
  // @ts-expect-error Weekly statistics cannot be requested by date.
  useTeamWeekStats({ date: "2026-09-20" });
  // @ts-expect-error Season statistics cannot be requested by week.
  useTeamSeasonStats({ weekId: "week" });
  // @ts-expect-error Consumers cannot assert their desired row type.
  useSeasonDataBundle<NHLTeam>();
  // @ts-expect-error Query errors throw; no fabricated in-band error.
  void teams.error;
  // @ts-expect-error Player query errors throw too.
  void usePlayers().error;
  // @ts-expect-error Season query errors throw too.
  void useSeasons().error;
  // @ts-expect-error Live subscriptions do not offer a fabricated refetch method.
  void useSeasons().refetch;
  return { teams, nhl, franchises, daily, weekly, seasons, bundle };
}
