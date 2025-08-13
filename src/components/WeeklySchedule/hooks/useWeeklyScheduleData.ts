import { useNavStore } from "@gshl-cache";
import { useMatchupsBySeasonId, useTeamsBySeasonId } from "@gshl-hooks";
import { filterMatchupsByWeek, sortMatchupsByRating } from "../utils";

/**
 * Custom hook for weekly schedule data
 */
export const useWeeklyScheduleData = () => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedWeekId = useNavStore((state) => state.selectedWeekId);

  const { data: matchups = [] } = useMatchupsBySeasonId(selectedSeasonId);
  const { data: teams = [] } = useTeamsBySeasonId(selectedSeasonId);

  // Filter and sort matchups for the selected week
  const weeklyMatchups = sortMatchupsByRating(
    filterMatchupsByWeek(matchups, selectedWeekId),
  );

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: weeklyMatchups,
    teams,
    allMatchups: matchups,
  };
};
