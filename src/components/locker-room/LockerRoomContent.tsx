"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { LockerRoomHeader } from "@gshl-components/team/LockerRoomHeader";
import {
  useCareerSplits,
  useDraftPicks,
  usePlayers,
  usePlayersByIds,
  usePlayerTotalsByPlayers,
  usePlayerAwards,
  useSeasonState,
  useTeams,
  useNHLTeams,
  useNav,
  useContractData,
  useTeamAwards,
} from "@gshl-hooks";
import { resolveContractDefaultSeason } from "@gshl-utils";
import type { GSHLTeam, NHLTeam } from "@gshl-types";
import { LockerRoomSkeleton, TeamRosterSkeleton } from "@gshl-skeletons";

const TeamRecordBook = dynamic(
  () =>
    import("@gshl-components/team/TeamRecordBook").then(
      (module) => module.TeamRecordBook,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const TeamDraftPickList = dynamic(
  () =>
    import("@gshl-components/team/TeamDraftPickList").then(
      (module) => module.TeamDraftPickList,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const TrophyCase = dynamic(
  () =>
    import("@gshl-components/team/TrophyCase").then(
      (module) => module.TrophyCase,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const TeamHistoryContainer = dynamic(
  () =>
    import("@gshl-components/team/TeamHistory").then(
      (module) => module.TeamHistoryContainer,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const TeamRoster = dynamic(
  () =>
    import("@gshl-components/team/TeamRoster").then(
      (module) => module.TeamRoster,
    ),
  { loading: () => <TeamRosterSkeleton /> },
);
const TeamContractTable = dynamic(
  () =>
    import("@gshl-components/contracts/ContractTable").then(
      (module) => module.TeamContractTable,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const FranchiseContractHistory = dynamic(
  () =>
    import("@gshl-components/contracts/ContractHistory").then(
      (module) => module.FranchiseContractHistory,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);
const FranchiseDraftPickSummary = dynamic(
  () =>
    import("@gshl-components/contracts/FranchiseDraftPickSummary").then(
      (module) => module.FranchiseDraftPickSummary,
    ),
  { loading: () => <LockerRoomSkeleton /> },
);

const SHOW_LOCKER_ROOM_ROSTER_SALARIES = true;

export function LockerRoomContent() {
  const { currentSeason, defaultSeason, seasons } = useSeasonState();
  const activeSeason = currentSeason ?? defaultSeason;
  const { selectedLockerRoomType, selectedOwnerId } = useNav();
  const contractSeason = useMemo(
    () => resolveContractDefaultSeason(seasons) ?? defaultSeason,
    [defaultSeason, seasons],
  );

  // Only fetch contract data when on a tab that needs it
  const needsContractData =
    selectedLockerRoomType === "salary" ||
    selectedLockerRoomType === "draft" ||
    selectedLockerRoomType === "roster";
  const lockerRoomSeason = needsContractData ? contractSeason : activeSeason;

  const needsDraftPicks =
    selectedLockerRoomType === "salary" || selectedLockerRoomType === "draft";
  const { data: draftPicks } = useDraftPicks({
    seasonId: lockerRoomSeason?.id,
    enabled: needsDraftPicks && Boolean(lockerRoomSeason?.id),
  });
  const { data: teamsRaw = [], isLoading: teamsLoading } = useTeams({
    seasonId: lockerRoomSeason?.id,
    enabled: Boolean(lockerRoomSeason?.id),
  });
  const teams = teamsRaw as GSHLTeam[];

  const currentTeam = teams?.find((t) => t.ownerId === selectedOwnerId);
  const isTrophyTab = selectedLockerRoomType === "trophy";
  const isRecordBookTab = selectedLockerRoomType === "recordbook";
  const needsHistoricalTeams = isTrophyTab || isRecordBookTab;
  const { data: historicalTeamsRaw = [] } = useTeams({
    enabled: needsHistoricalTeams,
  });
  const allTeams = needsHistoricalTeams
    ? (historicalTeamsRaw as GSHLTeam[])
    : teams;
  const needsPlayers = needsContractData || isRecordBookTab;
  const { data: players = [], isLoading: playersLoading } = usePlayers({
    gshlTeamId: currentTeam?.id,
    enabled: needsPlayers && Boolean(currentTeam?.id),
  });
  const needsNhlTeams =
    selectedLockerRoomType === "roster" ||
    selectedLockerRoomType === "salary" ||
    isRecordBookTab;
  const { data: nhlTeamsRaw = [], isLoading: nhlTeamsLoading } = useNHLTeams({
    enabled: needsNhlTeams,
  });
  const nhlTeams = nhlTeamsRaw as NHLTeam[];
  const { data: teamAwards = [], isLoading: teamAwardsLoading } = useTeamAwards(
    {
      enabled: isTrophyTab,
      orderBy: { seasonId: "desc" },
    },
  );
  const { data: playerAwards = [], isLoading: playerAwardsLoading } =
    usePlayerAwards({
      enabled: isRecordBookTab,
      orderBy: { seasonId: "desc" },
    });
  const franchiseTeamIds = useMemo(
    () =>
      allTeams
        .filter(
          (team) =>
            String(team.franchiseId) === String(currentTeam?.franchiseId ?? ""),
        )
        .map((team) => String(team.id)),
    [allTeams, currentTeam?.franchiseId],
  );
  const careerSplitsQuery = useCareerSplits({
    enabled: isRecordBookTab,
    teamIds: franchiseTeamIds,
  });
  const careerSplits = careerSplitsQuery.data;
  const recordBookPlayerIds = useMemo(
    () => [
      ...new Set(
        careerSplits.map((row) => String(row.playerId)).filter(Boolean),
      ),
    ],
    [careerSplits],
  );
  const playerTotalsQuery = usePlayerTotalsByPlayers(
    recordBookPlayerIds,
    isRecordBookTab,
  );
  const recordBookPlayersQuery = usePlayersByIds(
    recordBookPlayerIds,
    isRecordBookTab,
  );
  const recordBookPlayers = useMemo(
    () =>
      [...players, ...recordBookPlayersQuery.data].filter(
        (player, index, rows) =>
          rows.findIndex((candidate) => candidate.id === player.id) === index,
      ),
    [players, recordBookPlayersQuery.data],
  );

  const {
    table: teamContractTableData,
    history: teamContractHistory,
    draft: franchiseDraftSummary,
    currentContracts,
    contractPlayers,
  } = useContractData({
    currentSeason: contractSeason,
    currentTeam,
    players,
    nhlTeams,
    teams,
    allTeams,
    seasons,
    draftPicks,
    enabled: needsContractData,
  });

  const isLoading =
    teamsLoading ||
    (needsPlayers && playersLoading) ||
    (needsNhlTeams && nhlTeamsLoading) ||
    (isTrophyTab && teamAwardsLoading) ||
    (isRecordBookTab &&
      (playerAwardsLoading ||
        playerTotalsQuery.isLoading ||
        recordBookPlayersQuery.isLoading ||
        careerSplitsQuery.isLoading));

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
              currentSeason: contractSeason,
              players: contractPlayers,
              nhlTeams,
              contracts: currentContracts,
              currentTeam,
              ...teamContractTableData,
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
              selectedSeasonId: lockerRoomSeason?.id ?? "",
            }}
          />
        </>
      )}
      {selectedLockerRoomType === "trophy" && (
        <TrophyCase
          teamAwards={teamAwards}
          allTeams={allTeams}
          currentTeam={currentTeam}
          seasons={seasons}
        />
      )}
      {selectedLockerRoomType === "recordbook" && (
        <TeamRecordBook
          playerAwards={playerAwards}
          allTeams={allTeams}
          careerSplits={careerSplits}
          currentTeam={currentTeam}
          nhlTeams={nhlTeams}
          playerTotals={playerTotalsQuery.data}
          players={recordBookPlayers}
          seasons={seasons}
        />
      )}
    </>
  );
}
