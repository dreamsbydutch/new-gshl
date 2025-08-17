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
  useCurrentSeason,
  useTeamsBySeasonId,
  useNHLTeams,
} from "@gshl-hooks";
import { ContractStatus } from "@gshl-types";

export default function LockerRoomPage() {
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);

  const { data: contracts } = useAllContracts();
  const { data: currentSeason } = useCurrentSeason();
  // Derive season id safely; avoid non-null assertion after optional chain (lint rule).
  // Passing 0 when undefined yields an empty result set until real season loads.
  const seasonId = currentSeason?.[0]?.id;
  const { data: teams } = useTeamsBySeasonId(seasonId ?? 0);
  const { data: draftPicks } = useAllDraftPicks();
  const { data: nhlTeams } = useNHLTeams();

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
              draftPicks: draftPicks?.filter(
                (a) => a.gshlTeamId === currentTeam.id,
              ),
              contracts: teamContracts?.filter(
                (a) => a.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
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
