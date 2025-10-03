import { useMemo } from "react";
import { useNavSelections } from "./useNavSelections";
import { useSeasonMatchupsAndTeams } from "./useSeasonMatchupsAndTeams";
import { useWeeksBySeasonId } from "./useWeek";
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
  const { selectedSeasonId, selectedOwnerId } = useNavSelections();
  const { matchups: allMatchups, teams } = useSeasonMatchupsAndTeams(
    selectedSeasonId,
  );
  const { data: weeks = [] } = useWeeksBySeasonId(selectedSeasonId ?? "");

  // Find the selected team
  const selectedTeam = useMemo(
    () => teams.find((team) => team.ownerId === selectedOwnerId) ?? null,
    [teams, selectedOwnerId],
  );

  // Filter and sort matchups for the selected team
  const teamMatchups = useMemo(
    () =>
      sortMatchupsByWeek(
        filterTeamMatchups(allMatchups, selectedTeam?.id),
        weeks,
      ),
    [allMatchups, selectedTeam?.id, weeks],
  );

  // Enhanced matchups with week data
  const enhancedMatchups = useMemo<EnhancedMatchup[]>(
    () =>
      teamMatchups.map((matchup) => ({
        matchup,
        week: findWeekById(weeks, matchup.weekId),
      })),
    [teamMatchups, weeks],
  );

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedTeam,
    matchups: enhancedMatchups,
    teams,
    weeks,
    allMatchups,
  };
};
