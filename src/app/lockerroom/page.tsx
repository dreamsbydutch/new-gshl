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
import { ContractStatus } from "@gshl-types";
import { TeamHistoryContainer } from "@gshl-components/team/TeamHistory";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import { TeamContractTable } from "@gshl-components/contracts/ContractTable";
import { OwnerContractHistory } from "@gshl-components/contracts/ContractHistory";

export default function LockerRoomPage() {
  const { currentSeason, seasons } = useSeasonState();
  const { selectedLockerRoomType, selectedOwnerId } = useNav();
  const { data: draftPicks } = useDraftPicks();
  const { data: players = [] } = usePlayers();
  const { data: teamsRaw = [] } = useTeams();
  const allTeams = teamsRaw as GSHLTeam[];
  const teams = useMemo(
    () => allTeams.filter((team) => team.seasonId == currentSeason?.id),
    [allTeams, currentSeason?.id],
  );
  const { data: nhlTeamsRaw = [] } = useNHLTeams();
  const nhlTeams = nhlTeamsRaw as NHLTeam[];

  const currentTeam = teams?.find((t) => t.ownerId === selectedOwnerId);

  const {
    table: teamContractTableData,
    history: teamContractHistory,
    teamContracts,
  } = useContractData({
    currentSeason,
    currentTeam,
    players,
    nhlTeams,
    teams,
    allTeams,
    ownerId: selectedOwnerId,
  });

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
              currentSeason,
              players,
              nhlTeams,
              contracts: teamContracts,
              currentTeam,
              ...teamContractTableData,
            }}
          />
          <TeamDraftPickList
            {...{
              teams,
              allTeams,
              draftPicks, // now full list; component scopes by team & season
              contracts: teamContracts?.filter(
                (c) => c.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: currentSeason?.id ?? "",
            }}
          />
          <OwnerContractHistory {...teamContractHistory} />
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
              teams,
              allTeams,
              draftPicks: draftPicks,
              contracts: teamContracts?.filter(
                (c) => c.expiryStatus !== ContractStatus.BUYOUT,
              ),
              players,
              seasons,
              gshlTeamId: currentTeam.id,
              selectedSeasonId: currentSeason?.id ?? "",
            }}
          />
        </>
      )}
    </>
  );
}
