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
} from "@gshl-hooks";

export default function LockerRoomPage() {
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);

  const { data: contracts } = useAllContracts();
  const { data: currentSeason } = useCurrentSeason();
  const { data: teams } = useTeamsBySeasonId(currentSeason?.[0]?.id ?? 11);
  const { data: draftPicks } = useAllDraftPicks();

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
            }}
          />
          <TeamDraftPickList
            {...{
              teams,
              draftPicks: draftPicks?.filter(
                (a) => a.gshlTeamId === currentTeam.id,
              ),
              contracts: teamContracts?.filter(
                (a) => a.expiryStatus !== "Buyout",
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
            nhlPlayerStats: undefined,
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
