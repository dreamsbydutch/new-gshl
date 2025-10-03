/**
 * useWeeklyScheduleData
 * ---------------------
 * Centralizes the data transformations needed by the WeeklySchedule feature.
 * Returns:
 * - matchups scoped to the currently selected week
 * - the owning teams collection for contextual lookups
 * - selected season/week identifiers from the navigation store
 */
import { useNavStore } from "@gshl-cache";
import { useMatchupsBySeasonId, useTeamsBySeasonId } from "@gshl-hooks";
import {
  filterMatchupsByWeek,
  sortMatchupsByRating,
} from "@gshl-utils/weekly-schedule";

/**
 * Fetches and prepares matchup data for the weekly schedule display.
 */
export const useWeeklyScheduleData = () => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedWeekId = useNavStore((state) => state.selectedWeekId);

  const { data: matchups = [] } = useMatchupsBySeasonId(selectedSeasonId);
  const { data: teams = [] } = useTeamsBySeasonId(selectedSeasonId);

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
