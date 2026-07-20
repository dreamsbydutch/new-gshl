"use client";

import dynamic from "next/dynamic";
import {
  usePlayerAwards,
  usePlayers,
  usePlayerStats,
  useStandingsData,
  useTeamAwards,
} from "@gshl-hooks";
import { StandingsSkeleton } from "@gshl-skeletons";

const PlayoffBracket = dynamic(
  () =>
    import("@gshl-components/league/PlayoffBracket").then(
      (module) => module.PlayoffBracket,
    ),
  { loading: () => <StandingsSkeleton /> },
);
const SeasonAwards = dynamic(
  () =>
    import("@gshl-components/league/SeasonAwards").then(
      (module) => module.SeasonAwards,
    ),
  { loading: () => <StandingsSkeleton /> },
);
const StandingsTable = dynamic(
  () =>
    import("@gshl-components/league/StandingsContainer").then(
      (module) => module.StandingsTable,
    ),
  { loading: () => <StandingsSkeleton /> },
);

export function StandingsContent() {
  const {
    selectedSeason,
    selectedSeasonId,
    groups,
    standingsType,
    teams,
    stats,
    isLoading,
  } = useStandingsData({});
  const isAwardsView = (standingsType ?? "overall") === "awards";

  const { data: playerAwards = [], isLoading: playerAwardsLoading } =
    usePlayerAwards({
      seasonId: selectedSeasonId ?? undefined,
      enabled: isAwardsView && Boolean(selectedSeasonId),
      orderBy: { award: "asc" },
    });
  const { data: teamAwards = [], isLoading: teamAwardsLoading } = useTeamAwards(
    {
      seasonId: selectedSeasonId ?? undefined,
      enabled: isAwardsView && Boolean(selectedSeasonId),
      orderBy: { award: "asc" },
    },
  );
  const { data: players = [], isLoading: playersLoading } = usePlayers({
    enabled: isAwardsView,
  });
  const playerTotalsQuery = usePlayerStats({
    seasonId: selectedSeasonId ?? undefined,
    enabled: isAwardsView && Boolean(selectedSeasonId),
    includeDaily: false,
    includeWeekly: false,
    includeSplits: false,
    includeTotals: true,
  });

  if (
    isLoading ||
    (isAwardsView &&
      (playerAwardsLoading ||
        teamAwardsLoading ||
        playersLoading ||
        playerTotalsQuery.status.isLoading))
  ) {
    return <StandingsSkeleton />;
  }

  if (isAwardsView) {
    return (
      <SeasonAwards
        playerAwards={playerAwards}
        teamAwards={teamAwards}
        players={players}
        playerTotals={playerTotalsQuery.totals}
        season={selectedSeason ?? null}
        teams={teams}
      />
    );
  }

  if ((standingsType ?? "overall") === "playoff") {
    return (
      <PlayoffBracket
        teams={teams}
        stats={stats}
        season={selectedSeason ?? null}
      />
    );
  }

  return (
    <StandingsTable
      groups={groups}
      selectedSeason={selectedSeason ?? null}
      standingsType={standingsType ?? "overall"}
    />
  );
}
