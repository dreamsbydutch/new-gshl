import { useNavStore } from "@gshl-cache";
import {
  useMatchupsBySeasonId,
  useTeamsBySeasonId,
  useWeeksBySeasonId,
} from "@gshl-hooks";
import type { GSHLTeam, Matchup, Week } from "@gshl-types";
import {
  filterTeamMatchups,
  sortMatchupsByWeek,
  findWeekById,
} from "@gshl-utils/team-schedule";

interface EnhancedMatchup {
  matchup: Matchup;
  week: Week | undefined;
}

interface TeamScheduleData {
  selectedSeasonId: string | null;
  selectedOwnerId: string | null;
  selectedTeam: GSHLTeam | null;
  matchups: EnhancedMatchup[];
  teams: GSHLTeam[];
  weeks: Week[];
  allMatchups: Matchup[];
}

/**
 * Provides the selected team's schedule enriched with week metadata.
 *
 * @returns {TeamScheduleData} The selected team context, filtered matchups, and supporting collections.
 */
export const useTeamScheduleData = (): TeamScheduleData => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);

  const { data: matchups = [] } = useMatchupsBySeasonId(selectedSeasonId);
  const { data: teams = [] } = useTeamsBySeasonId(selectedSeasonId);
  const { data: weeks = [] } = useWeeksBySeasonId(selectedSeasonId);

  // Find the selected team
  const selectedTeam =
    teams.find((team) => team.ownerId === selectedOwnerId) ?? null;

  // Filter and sort matchups for the selected team
  const teamMatchups = sortMatchupsByWeek(
    filterTeamMatchups(matchups, selectedTeam?.id),
    weeks,
  );

  // Enhanced matchups with week data
  const enhancedMatchups: EnhancedMatchup[] = teamMatchups.map(
    (matchup: Matchup) => ({
      matchup,
      week: findWeekById(weeks, matchup.weekId),
    }),
  );

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedTeam,
    matchups: enhancedMatchups,
    teams,
    weeks,
    allMatchups: matchups,
  };
};
