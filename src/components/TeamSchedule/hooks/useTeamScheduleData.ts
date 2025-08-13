import { useNavStore } from "@gshl-cache";
import {
  useMatchupsBySeasonId,
  useTeamsBySeasonId,
  useWeeksBySeasonId,
} from "@gshl-hooks";
import { filterTeamMatchups, sortMatchupsByWeek, findWeekById } from "../utils";

/**
 * Custom hook for team schedule data
 */
export const useTeamScheduleData = () => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);

  const { data: matchups = [] } = useMatchupsBySeasonId(selectedSeasonId);
  const { data: teams = [] } = useTeamsBySeasonId(selectedSeasonId);
  const { data: weeks = [] } = useWeeksBySeasonId(selectedSeasonId);

  // Find the selected team
  const selectedTeam =
    teams.find((team) => team.ownerId === selectedOwnerId) || null;

  // Filter and sort matchups for the selected team
  const teamMatchups = sortMatchupsByWeek(
    filterTeamMatchups(matchups, selectedTeam?.id),
    weeks,
  );

  // Enhanced matchups with week data
  const enhancedMatchups = teamMatchups.map((matchup) => ({
    matchup,
    week: findWeekById(weeks, matchup.weekId),
  }));

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
