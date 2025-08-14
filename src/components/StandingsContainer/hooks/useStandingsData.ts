import { useSeasonNavigation } from "@gshl-cache";
import {
  useMatchupsBySeasonId,
  useTeamsBySeasonId,
  useTeamSeasonsBySeasonId,
} from "@gshl-hooks";
import { groupTeamsByStandingsType } from "../utils";
import type { StandingsGroup } from "../utils/types";

/**
 * Custom hook for standings data and navigation
 */
export const useStandingsData = (standingsType: string) => {
  const { selectedSeason, selectedSeasonId } = useSeasonNavigation();
  const { data: matchups } = useMatchupsBySeasonId(selectedSeasonId);
  const { data: teams = [] } = useTeamsBySeasonId(selectedSeasonId);
  const { data: stats = [] } = useTeamSeasonsBySeasonId(selectedSeasonId);

  const groups: StandingsGroup[] = groupTeamsByStandingsType(
    teams,
    stats,
    standingsType,
  );
  return {
    selectedSeason,
    selectedSeasonId,
    matchups,
    teams,
    groups,
    stats,
  };
};
