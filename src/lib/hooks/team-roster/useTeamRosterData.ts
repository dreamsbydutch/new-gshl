import { useMemo } from "react";
import {
  RosterPosition,
  type Contract,
  type GSHLTeam,
  type Player,
} from "@gshl-types";
import { buildTeamLineup } from "@gshl-utils/team-roster";

export const useTeamRosterData = (
  players: Player[] | undefined,
  contracts: Contract[] | undefined,
  currentTeam: GSHLTeam | undefined,
) => {
  const currentRoster = useMemo(() => {
    return players
      ?.filter((a) => a.gshlTeamId === currentTeam?.franchiseId)
      ?.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  }, [players, currentTeam?.franchiseId]);

  const teamLineup = useMemo(() => {
    return buildTeamLineup(currentRoster);
  }, [currentRoster]);

  const benchPlayers = useMemo(() => {
    return (
      currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.BN) ?? []
    );
  }, [currentRoster]);

  const totalCapHit = useMemo(() => {
    return contracts?.reduce((prev, curr) => prev + curr.capHit, 0) ?? 0;
  }, [contracts]);

  return {
    currentRoster,
    teamLineup,
    benchPlayers,
    totalCapHit,
  };
};
