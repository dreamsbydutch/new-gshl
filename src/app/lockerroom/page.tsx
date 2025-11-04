"use client";

import { useEffect, useMemo, useRef } from "react";
import { useNavStore } from "@gshl-cache";
import { TeamContractTable } from "@gshl-components/contracts/ContractTable";
import { LockerRoomHeader } from "@gshl-components/team/LockerRoomHeader";
import { TeamDraftPickList } from "@gshl-components/team/TeamDraftPickList";
import { TeamHistoryContainer } from "@gshl-components/team/TeamHistory";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import {
  useAllContracts,
  useDraftPicks,
  usePlayers,
  useSeasonState,
  useTeams,
  useNHLTeams,
} from "@gshl-hooks";
import type { GSHLTeam, NHLTeam } from "@gshl-types";
import { ContractStatus } from "@gshl-types";
import { OwnerContractHistory } from "@gshl-components/contracts/ContractHistory";
import { DraftAdminList } from "@gshl-components/draft/DraftAdminList";

export default function LockerRoomPage() {
  const DEFAULT_SEASON_ID = "12";
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
    setSelectedSeasonId,
  } = useSeasonState();

  const hasInitializedSeason = useRef(false);

  const lockerRoomDefaultSeason = useMemo(() => {
    const explicitSeason = seasons?.find(
      (season) => String(season.id) === DEFAULT_SEASON_ID,
    );

    if (explicitSeason) {
      return explicitSeason;
    }

    return defaultSeason ?? currentSeason ?? selectedSeason ?? null;
  }, [
    seasons,
    DEFAULT_SEASON_ID,
    defaultSeason,
    currentSeason,
    selectedSeason,
  ]);

  useEffect(() => {
    if (hasInitializedSeason.current) return;
    if (!lockerRoomDefaultSeason?.id) return;

    const desiredSeasonId = String(lockerRoomDefaultSeason.id);
    if (selectedSeasonId !== desiredSeasonId) {
      setSelectedSeasonId(desiredSeasonId);
    }

    hasInitializedSeason.current = true;
  }, [lockerRoomDefaultSeason?.id, selectedSeasonId, setSelectedSeasonId]);

  const activeSeason =
    selectedSeason ?? lockerRoomDefaultSeason ?? currentSeason ?? defaultSeason;
  const resolvedSeasonId =
    selectedSeasonId ?? activeSeason?.id?.toString() ?? "";

  const { data: contracts, getContracts } = useAllContracts();
  const { data: teamsRaw = [] } = useTeams({ seasonId: resolvedSeasonId });
  const teams = teamsRaw as GSHLTeam[];
  const { data: draftPicks } = useDraftPicks();
  const { data: nhlTeamsRaw = [] } = useNHLTeams();
  const nhlTeams = nhlTeamsRaw as NHLTeam[];
  const { data: allTeamsRaw = [] } = useTeams();
  const allTeams = allTeamsRaw as GSHLTeam[];

  // Temporary fallback: if no teams from season filter, try filtering allTeams
  const effectiveTeams =
    teams && teams.length > 0
      ? teams
      : allTeams.filter((t) => t.seasonId === resolvedSeasonId);

  const currentTeam = effectiveTeams?.find(
    (t) => t.ownerId === selectedOwnerId,
  );
  const teamContracts = useMemo(() => {
    if (!currentTeam?.franchiseId) return [];
    return getContracts({
      filters: {
        currentFranchiseIds: currentTeam.franchiseId,
        activeOnly: true,
      },
    });
  }, [currentTeam?.franchiseId, getContracts]);

  const teamContractsWithoutBuyouts = useMemo(
    () =>
      teamContracts.filter(
        (contract) => contract.expiryStatus !== ContractStatus.BUYOUT,
      ),
    [teamContracts],
  );
  const { data: players = [] } = usePlayers();

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
              contracts: teamContractsWithoutBuyouts,
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
      {selectedLockerRoomType === "draft" && (
        <>
          <TeamDraftPickList
            {...{
              teams: effectiveTeams,
              allTeams,
              draftPicks: draftPicks, // now full list; component scopes by team & season
              contracts: teamContractsWithoutBuyouts,
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: resolvedSeasonId,
            }}
          />
          {selectedOwnerId === "1" && (
            <>
              <DraftAdminList />
            </>
          )}
        </>
      )}
    </>
  );
}
