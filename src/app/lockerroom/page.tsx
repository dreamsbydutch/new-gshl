"use client";

import { useNavStore } from "@gshl-cache";
import { TeamContractTable } from "@gshl-components/ContractTable";
import { LockerRoomHeader } from "@gshl-components/LockerRoomHeader";
import { TeamDraftPickList } from "@gshl-components/TeamDraftPickList";
import { TeamHistoryContainer } from "@gshl-components/TeamHistory";
import { TeamRoster } from "@gshl-components/TeamRoster";
import {
  useAllContracts,
  useAllDraftPicks,
  useAllPlayers,
  useAllSeasons,
  useCurrentSeason,
  useTeamsBySeasonId,
  useAllTeams,
  useNHLTeams,
} from "@gshl-hooks";
import { ContractStatus } from "@gshl-types";
import { useSeasonNavigation } from "@gshl-cache";
import { OwnerContractHistory } from "@gshl-components/ContractHistory";

export default function LockerRoomPage() {
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const { selectedSeasonId: navSelectedSeasonId } = useSeasonNavigation();

  const { data: contracts } = useAllContracts();
  const { data: currentSeason } = useCurrentSeason();
  // Derive season id safely; avoid non-null assertion after optional chain (lint rule).
  // Passing 0 when undefined yields an empty result set until real season loads.
  const seasonId = currentSeason?.[0]?.id;
  const { data: teams } = useTeamsBySeasonId(seasonId ?? 0);
  const { data: draftPicks } = useAllDraftPicks();
  const { data: seasons } = useAllSeasons();
  const { data: nhlTeams } = useNHLTeams();
  const { data: allTeams } = useAllTeams();

  const currentTeam = teams?.find((t) => t.ownerId === selectedOwnerId);
  const teamContracts = contracts?.filter(
    (c) =>
      c.currentFranchiseId === currentTeam?.franchiseId &&
      c.capHitEndDate > new Date(),
  );
  const { data: players } = useAllPlayers();

  if (!currentTeam) {
    return null;
  }
  return (
    <>
      <LockerRoomHeader currentTeam={currentTeam} />
      {selectedLockerRoomType === "salary" && (
        <>
          <TeamContractTable
            {...{
              currentSeason: currentSeason?.[0],
              currentTeam,
              contracts: teamContracts,
              players,
              nhlTeams,
            }}
          />
          <TeamDraftPickList
            {...{
              teams,
              allTeams,
              draftPicks: draftPicks, // now full list; component scopes by team & season
              contracts: teamContracts?.filter(
                (a) => a.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: navSelectedSeasonId,
            }}
          />
          <OwnerContractHistory
            {...{
              ownerId: selectedOwnerId,
              teams,
              allTeams,
              contracts,
              players,
              seasons,
            }}
          />
        </>
      )}
      {selectedLockerRoomType === "roster" && (
        <TeamRoster
          {...{
            players,
            contracts: teamContracts,
            currentTeam,
          }}
        />
      )}
      {selectedLockerRoomType === "history" && (
        <TeamHistoryContainer
          {...{
            teamInfo: currentTeam,
          }}
        />
      )}
    </>
  );
}
