import { useMemo } from "react";
import { Contract, DraftPick, GSHLTeam, Player } from "@gshl-types";
import {
  formatDraftPickDescription,
  getOriginalTeamName,
  isDraftPickAvailable,
  getSelectedPlayer,
} from "../utils";
import type { ProcessedDraftPick } from "../utils";

export const useTeamDraftPickListData = (
  teams: GSHLTeam[] | undefined,
  draftPicks: DraftPick[] | undefined,
  contracts: Contract[] | undefined,
  players: Player[] | undefined,
) => {
  const processedDraftPicks = useMemo((): ProcessedDraftPick[] => {
    if (!draftPicks || !teams || !contracts || !players) return [];

    return draftPicks
      .sort((a, b) => a.pick - b.pick)
      .map((draftPick, index) => {
        let originalTeam: GSHLTeam | undefined = undefined;
        if (draftPick.originalTeamId !== draftPick.gshlTeamId) {
          originalTeam = teams.find(
            (team) => team.id === draftPick.originalTeamId,
          );
        }

        const isAvailable = isDraftPickAvailable(draftPicks, contracts, index);
        const selectedPlayer = isAvailable
          ? undefined
          : getSelectedPlayer(contracts, players, draftPicks, index);

        return {
          draftPick,
          originalTeam,
          isAvailable,
          selectedPlayer,
        };
      });
  }, [draftPicks, teams, contracts, players]);

  const isDataReady = !!(teams && draftPicks && contracts && players);

  return {
    processedDraftPicks,
    isDataReady,
  };
};
