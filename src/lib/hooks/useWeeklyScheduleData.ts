/**
 * useWeeklyScheduleData
 * ---------------------
 * Centralizes the data transformations needed by the WeeklySchedule feature.
 * Returns:
 * - matchups scoped to the currently selected week
 * - the owning teams collection for contextual lookups
 * - selected season/week identifiers from the navigation store
 */
import { useMemo } from "react";
import { useNavSelections } from "./useNavSelections";
import { useSeasonMatchupsAndTeams } from "./useSeasonMatchupsAndTeams";
import {
  filterMatchupsByWeek,
  sortMatchupsByRating,
} from "@gshl-utils/weekly-schedule";

/**
 * Fetches and prepares matchup data for the weekly schedule display.
 */
export const useWeeklyScheduleData = () => {
  const { selectedSeasonId, selectedWeekId } = useNavSelections();
  const { matchups: allMatchups, teams } = useSeasonMatchupsAndTeams(
    selectedSeasonId,
  );

  const weeklyMatchups = useMemo(
    () =>
      sortMatchupsByRating(filterMatchupsByWeek(allMatchups, selectedWeekId)),
    [allMatchups, selectedWeekId],
  );

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: weeklyMatchups,
    teams,
    allMatchups,
  };
};
