import { useSeasonNavigation } from "@gshl-cache";
import {
  useMatchupsBySeasonId,
  useTeamsBySeasonId,
  useTeamSeasonsBySeasonId,
} from "@gshl-hooks";
import {
  groupTeamsByStandingsType,
  type StandingsGroup,
} from "@gshl-utils/standings-container";

/**
 * Custom hook for standings data and navigation.
 * Provides grouped team standings for a particular season and standings type.
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
