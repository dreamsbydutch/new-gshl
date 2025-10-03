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
  useSeasonState,
  useTeamsBySeasonId,
  useAllTeams,
  useNHLTeams,
} from "@gshl-hooks";
import { ContractStatus } from "@gshl-types";
import { OwnerContractHistory } from "@gshl-components/ContractHistory";

export default function LockerRoomPage() {
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const {
    seasons,
    selectedSeason,
    currentSeason,
    defaultSeason,
    selectedSeasonId,
  } = useSeasonState();

  const activeSeason = selectedSeason ?? currentSeason ?? defaultSeason;
  const resolvedSeasonId =
    activeSeason?.id?.toString() ?? selectedSeasonId ?? "";

  const { data: contracts } = useAllContracts();
  const { data: teams } = useTeamsBySeasonId(resolvedSeasonId);
  const { data: draftPicks } = useAllDraftPicks();
  const { data: nhlTeams } = useNHLTeams();
  const { data: allTeams } = useAllTeams();

  // Temporary fallback: if no teams from season filter, try filtering allTeams
  const effectiveTeams =
    teams && teams.length > 0
      ? teams
      : (allTeams?.filter((t) => t.seasonId === resolvedSeasonId) ?? []);

  const currentTeam = effectiveTeams?.find(
    (t) => t.ownerId === selectedOwnerId,
  );
  const teamContracts = contracts?.filter(
    (c) =>
      c.currentFranchiseId === currentTeam?.franchiseId &&
      c.capHitEndDate instanceof Date &&
      c.capHitEndDate > new Date(),
  );
  const { data: players } = useAllPlayers();

  if (!currentTeam) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No roster data found for the selected owner in this season.
      </div>
    );
  }
  return (
    <>
      <LockerRoomHeader currentTeam={currentTeam} />
      {selectedLockerRoomType === "salary" && (
        <>
          <TeamContractTable
            {...{
              currentSeason: activeSeason,
              currentTeam,
              contracts: teamContracts,
              players,
              nhlTeams,
            }}
          />
          <TeamDraftPickList
            {...{
              teams: effectiveTeams,
              allTeams,
              draftPicks: draftPicks, // now full list; component scopes by team & season
              contracts: teamContracts?.filter(
                (a) => a.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: resolvedSeasonId,
            }}
          />
          <OwnerContractHistory
            {...{
              ownerId: selectedOwnerId,
              teams: effectiveTeams,
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
      {selectedLockerRoomType === "draft" &&
        (selectedOwnerId === "1" ? (
          <></>
        ) : (
          <TeamDraftPickList
            {...{
              teams: effectiveTeams,
              allTeams,
              draftPicks: draftPicks, // now full list; component scopes by team & season
              contracts: teamContracts?.filter(
                (a) => a.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: resolvedSeasonId,
            }}
          />
        ))}
    </>
  );
}
