"use client";

import { useMemo } from "react";
import { LockerRoomHeader } from "@gshl-components/team/LockerRoomHeader";
import { TeamDraftPickList } from "@gshl-components/team/TeamDraftPickList";
import {
  useDraftPicks,
  usePlayers,
  useSeasonState,
  useTeams,
  useNHLTeams,
  useNav,
  useContractData,
} from "@gshl-hooks";
import type { GSHLTeam, NHLTeam } from "@gshl-types";
import { TeamHistoryContainer } from "@gshl-components/team/TeamHistory";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import {
  TeamBuyoutTable,
  TeamContractTable,
} from "@gshl-components/contracts/ContractTable";
import { FranchiseContractHistory } from "@gshl-components/contracts/ContractHistory";
import { FranchiseDraftPickSummary } from "@gshl-components/contracts/FranchiseDraftPickSummary";
import { LockerRoomSkeleton, TeamRosterSkeleton } from "@gshl-skeletons";

const SHOW_LOCKER_ROOM_ROSTER_SALARIES = false;

export function LockerRoomContent() {
  const { currentSeason, defaultSeason, seasons } = useSeasonState();
  const activeSeason = currentSeason ?? defaultSeason;
  const { selectedLockerRoomType, selectedOwnerId } = useNav();

  // Only fetch contract data when on a tab that needs it
  const needsContractData =
    selectedLockerRoomType === "salary" ||
    selectedLockerRoomType === "draft" ||
    selectedLockerRoomType === "roster";

  const { data: draftPicks } = useDraftPicks();
  const { data: players = [], isLoading: playersLoading } = usePlayers();
  const { data: teamsRaw = [], isLoading: teamsLoading } = useTeams();
  const allTeams = teamsRaw as GSHLTeam[];
  const teams = useMemo(
    () => allTeams.filter((team) => team.seasonId == activeSeason?.id),
    [allTeams, activeSeason?.id],
  );
  const { data: nhlTeamsRaw = [], isLoading: nhlTeamsLoading } = useNHLTeams();
  const nhlTeams = nhlTeamsRaw as NHLTeam[];

  const currentTeam = teams?.find((t) => t.ownerId === selectedOwnerId);

  const {
    table: teamContractTableData,
    history: teamContractHistory,
    draft: franchiseDraftSummary,
    currentContracts,
    buyoutContracts,
  } = useContractData({
    currentSeason: activeSeason,
    currentTeam,
    players,
    nhlTeams,
    teams,
    allTeams,
    seasons,
    draftPicks,
    enabled: needsContractData,
  });

  const isLoading = teamsLoading || playersLoading || nhlTeamsLoading;

  if (isLoading) {
    if (selectedLockerRoomType === "roster") {
      return <TeamRosterSkeleton />;
    }
    return <LockerRoomSkeleton />;
  }

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
              players,
              nhlTeams,
              contracts: currentContracts,
              currentTeam,
              ...teamContractTableData,
            }}
          />
          <TeamBuyoutTable
            {...{
              buyoutContracts,
              currentTeam,
              players,
              nhlTeams,
              ready: teamContractTableData.ready,
            }}
          />
          <FranchiseDraftPickSummary {...franchiseDraftSummary} />
          <FranchiseContractHistory {...teamContractHistory} />
        </>
      )}
      {selectedLockerRoomType === "roster" && (
        <TeamRoster
          {...{
            players,
            contracts: currentContracts,
            currentTeam,
            showSalaries: SHOW_LOCKER_ROOM_ROSTER_SALARIES,
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
              teams,
              allTeams,
              draftPicks: draftPicks,
              contracts: currentContracts,
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: activeSeason?.id ?? "",
            }}
          />
        </>
      )}
    </>
  );
}
