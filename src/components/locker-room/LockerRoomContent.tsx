"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LockerRoomHeader } from "@gshl-components/team/LockerRoomHeader";
import {
  useAuthSession,
  useCareerSplits,
  usePlayers,
  usePlayersByIds,
  usePlayerSplitsByTeams,
  usePlayerTotalsByPlayers,
  usePlayerAwards,
  useSeasonState,
  useLockerRoomTeamOptions,
  useNHLTeams,
  useNav,
  useContractData,
  useTeamAwards,
} from "@gshl-hooks";
import { getOwnerTeamIds, resolveSalaryCapSeason } from "@gshl-utils";
import { isRosterSigningWindowOpen } from "@gshl-utils/features/roster-signing-window";
import { resolveUfaSigningSeason } from "@gshl-utils/features/ufa-deadline";
import {
  ContractHistorySkeleton,
  DraftPickListSkeleton,
  LockerRoomHeaderSkeleton,
  LockerRoomSalarySkeleton,
  LockerRoomSkeleton,
  TeamContractTableSkeleton,
  TeamHistorySkeleton,
  TeamRecordBookSkeleton,
  TeamRosterSkeleton,
  TrophyCaseSkeleton,
} from "@gshl-skeletons";

const TeamRecordBook = dynamic(
  () =>
    import("@gshl-components/team/TeamRecordBook").then(
      (module) => module.TeamRecordBook,
    ),
  { loading: () => <TeamRecordBookSkeleton /> },
);
const TeamPicks = dynamic(
  () =>
    import("@gshl-components/team/TeamPicks").then(
      (module) => module.TeamPicks,
    ),
  { loading: () => <DraftPickListSkeleton /> },
);
const TrophyCase = dynamic(
  () =>
    import("@gshl-components/team/TrophyCase").then(
      (module) => module.TrophyCase,
    ),
  { loading: () => <TrophyCaseSkeleton /> },
);
const TeamHistoryContainer = dynamic(
  () =>
    import("@gshl-components/team/TeamHistory").then(
      (module) => module.TeamHistoryContainer,
    ),
  { loading: () => <TeamHistorySkeleton /> },
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
  { loading: () => <TeamContractTableSkeleton /> },
);
const FranchiseContractHistory = dynamic(
  () =>
    import("@gshl-components/contracts/ContractHistory").then(
      (module) => module.FranchiseContractHistory,
    ),
  { loading: () => <ContractHistorySkeleton /> },
);

const TradeBlock = dynamic(
  () =>
    import("@gshl-components/team/TradeBlock").then(
      (module) => module.TradeBlock,
    ),
  {
    loading: () => (
      <p className="py-3 text-xs text-slate-500">Loading trade block...</p>
    ),
  },
);

export function LockerRoomContent() {
  const { session } = useAuthSession();
  const [capView, setCapView] = useState("contracts");
  const { selectedSeason, currentSeason, defaultSeason, seasons } =
    useSeasonState();
  const contextSeason = selectedSeason ?? currentSeason ?? defaultSeason;
  const showRosterSalaries = isRosterSigningWindowOpen(
    resolveUfaSigningSeason(seasons),
  );
  const { selectedLockerRoomType: storedView, selectedOwnerId } = useNav();
  const selectedLockerRoomType =
    storedView === "overview" ? "roster" : storedView;
  const salaryCapSeason = useMemo(
    () => resolveSalaryCapSeason(seasons, contextSeason, defaultSeason),
    [contextSeason, defaultSeason, seasons],
  );
  const contractSeason =
    selectedLockerRoomType === "salary"
      ? salaryCapSeason
      : (contextSeason ?? salaryCapSeason);

  // Only fetch contract data when on a tab that needs it
  const needsContractData =
    selectedLockerRoomType === "salary" || selectedLockerRoomType === "roster";
  const teamCatalog = useLockerRoomTeamOptions();
  const teamsLoading = teamCatalog.isLoading;
  const allTeams = teamCatalog.allTeams;
  const currentTeam = teamCatalog.teamOptions.find(
    (team) => team.ownerId === selectedOwnerId,
  );
  const yahooTeamId = currentTeam?.ownerIsActive
    ? currentTeam.yahooId?.trim()
    : undefined;
  const teams = allTeams.filter(
    (team) => team.seasonId === (currentTeam?.seasonId ?? contextSeason?.id),
  );
  const isInactiveOwner = Boolean(currentTeam && !currentTeam.ownerIsActive);
  const lastTeamSeason = seasons.find(
    (season) => season.id === currentTeam?.seasonId,
  );
  const isTrophyTab = selectedLockerRoomType === "trophy";
  const isRecordBookTab = selectedLockerRoomType === "recordbook";
  const needsPlayers = needsContractData || isRecordBookTab;
  const { data: players = [], isLoading: playersLoading } = usePlayers({
    ownerId: currentTeam?.ownerId,
    enabled: needsPlayers && Boolean(currentTeam?.ownerId),
  });
  const needsNhlTeams = selectedLockerRoomType === "salary" || isRecordBookTab;
  const { data: nhlTeamsRaw = [], isLoading: nhlTeamsLoading } = useNHLTeams({
    enabled: needsNhlTeams,
  });
  const nhlTeams = nhlTeamsRaw;
  const { data: teamAwards = [], isLoading: teamAwardsLoading } = useTeamAwards(
    {
      enabled: isTrophyTab || isRecordBookTab,
      orderBy: { seasonId: "desc" },
    },
  );
  const { data: playerAwards = [], isLoading: playerAwardsLoading } =
    usePlayerAwards({
      enabled: isRecordBookTab,
      orderBy: { seasonId: "desc" },
    });
  const ownerTeamIds = useMemo(
    () =>
      currentTeam ? getOwnerTeamIds(allTeams, currentTeam) : new Set<string>(),
    [allTeams, currentTeam],
  );
  const careerSplitsQuery = useCareerSplits({
    enabled: isRecordBookTab,
    teamIds: [...ownerTeamIds],
  });
  const careerSplits = careerSplitsQuery.data;
  const seasonSplitsQuery = usePlayerSplitsByTeams({
    enabled: isRecordBookTab,
    teamIds: [...ownerTeamIds],
  });
  const seasonSplits = seasonSplitsQuery.data;
  const recordBookPlayerIds = useMemo(
    () => [
      ...new Set(
        [...careerSplits, ...seasonSplits]
          .map((row) => String(row.playerId))
          .concat(playerAwards.map((award) => String(award.playerId)))
          .filter(Boolean),
      ),
    ],
    [careerSplits, playerAwards, seasonSplits],
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
    currentContracts,
    contractPlayers,
    isLoading: contractDataLoading,
  } = useContractData({
    currentSeason: contractSeason,
    currentTeam,
    players,
    nhlTeams,
    teams,
    allTeams,
    seasons,
    enabled: needsContractData,
  });

  const isLoading =
    teamsLoading ||
    (needsPlayers && playersLoading) ||
    (needsContractData && contractDataLoading) ||
    (needsNhlTeams && nhlTeamsLoading) ||
    (isTrophyTab && teamAwardsLoading) ||
    (isRecordBookTab &&
      (teamAwardsLoading ||
        playerAwardsLoading ||
        playerTotalsQuery.isLoading ||
        recordBookPlayersQuery.isLoading ||
        careerSplitsQuery.isLoading ||
        seasonSplitsQuery.isLoading));

  if (isLoading) {
    if (selectedLockerRoomType === "salary") {
      return <LockerRoomSalarySkeleton />;
    }
    if (selectedLockerRoomType === "history") {
      return (
        <>
          <LockerRoomHeaderSkeleton />
          <TeamHistorySkeleton />
        </>
      );
    }
    if (selectedLockerRoomType === "trophy") {
      return (
        <>
          <LockerRoomHeaderSkeleton />
          <TrophyCaseSkeleton />
        </>
      );
    }
    if (selectedLockerRoomType === "recordbook") {
      return (
        <>
          <LockerRoomHeaderSkeleton />
          <TeamRecordBookSkeleton />
        </>
      );
    }
    if (selectedLockerRoomType === "draft") {
      return (
        <>
          <LockerRoomHeaderSkeleton />
          <DraftPickListSkeleton />
        </>
      );
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
      <LockerRoomHeader
        currentTeam={currentTeam}
        headingLevel={2}
        yahooTeamId={yahooTeamId}
      />
      {isInactiveOwner && (
        <p className="mb-3 text-xs text-slate-500">
          <span className="font-semibold">Inactive owner</span>
          {lastTeamSeason ? ` - Last team: ${lastTeamSeason.name}` : ""}
        </p>
      )}
      {selectedLockerRoomType === "salary" && (
        <>
          <div
            className="mb-3 flex gap-4 border-b border-slate-200"
            role="group"
            aria-label="Salary cap views"
          >
            {(
              [
                ["contracts", "Contracts"],
                ["history", "History"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={capView === key}
                onClick={() => setCapView(key)}
                className={`min-h-11 border-b-2 px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${capView === key ? "border-slate-950 font-semibold text-slate-950" : "border-transparent text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div hidden={capView !== "contracts"}>
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
          </div>
          <div hidden={capView !== "history"}>
            <FranchiseContractHistory {...teamContractHistory} />
          </div>
        </>
      )}
      {selectedLockerRoomType === "tradeBlock" &&
        (session?.user.status === "active" ? (
          <TradeBlock key={currentTeam.ownerId} currentTeam={currentTeam} />
        ) : (
          <p className="py-6 text-sm text-slate-500">
            Sign in to explore the trade market.{" "}
            <Link
              className="underline"
              href="/signin?callbackUrl=%2Flockerroom%3Fview%3DtradeBlock"
            >
              Sign in
            </Link>
          </p>
        ))}
      {selectedLockerRoomType === "roster" && (
        <TeamRoster
          {...{
            players,
            contracts: currentContracts,
            currentTeam,
            showSalaries: showRosterSalaries,
            showContractIcons: true,
          }}
        />
      )}
      {selectedLockerRoomType === "history" && (
        <TeamHistoryContainer
          key={currentTeam.ownerId}
          {...{
            teamInfo: currentTeam,
          }}
        />
      )}
      {selectedLockerRoomType === "draft" && (
        <TeamPicks
          key={currentTeam.ownerId}
          team={currentTeam}
          teams={allTeams}
          seasons={seasons}
        />
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
          teamAwards={teamAwards}
          allTeams={allTeams}
          careerSplits={careerSplits}
          currentTeam={currentTeam}
          nhlTeams={nhlTeams}
          playerTotals={playerTotalsQuery.data}
          players={recordBookPlayers}
          seasonSplits={seasonSplits}
          seasons={seasons}
        />
      )}
    </>
  );
}
