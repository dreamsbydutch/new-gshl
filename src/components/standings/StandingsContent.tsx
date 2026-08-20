"use client";

import dynamic from "next/dynamic";
import {
  usePlayerAwards,
  usePlayers,
  usePlayerStats,
  useStandingsData,
  useTeamAwards,
} from "@gshl-hooks";
import {
  PlayoffBracketSkeleton,
  PowerRankingsSkeleton,
  SeasonAwardsSkeleton,
  StandingsSkeleton,
} from "@gshl-skeletons";

const PlayoffBracket = dynamic(
  () =>
    import("@gshl-components/league/PlayoffBracket").then(
      (module) => module.PlayoffBracket,
    ),
  { loading: () => <PlayoffBracketSkeleton /> },
);
const SeasonAwards = dynamic(
  () =>
    import("@gshl-components/league/SeasonAwards").then(
      (module) => module.SeasonAwards,
    ),
  { loading: () => <SeasonAwardsSkeleton /> },
);
const StandingsTable = dynamic(
  () =>
    import("@gshl-components/league/StandingsContainer").then(
      (module) => module.StandingsTable,
    ),
  { loading: () => <StandingsSkeleton /> },
);
const PowerRankings = dynamic(
  () =>
    import("@gshl-components/standings/PowerRankings").then(
      (module) => module.PowerRankings,
    ),
  { loading: () => <PowerRankingsSkeleton /> },
);

export function StandingsContent() {
  const {
    selectedSeason,
    selectedSeasonId,
    groups,
    matchups,
    weeks,
    standingsType,
    teams,
    stats,
    powerRankings,
    isLoading,
  } = useStandingsData({});
  const isAwardsView = (standingsType ?? "overall") === "awards";
  const isTeamStandingsView = ["overall", "conference", "wildcard"].includes(
    standingsType ?? "overall",
  );

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
    enabled: isAwardsView || isTeamStandingsView,
  });
  const playerTotalsQuery = usePlayerStats({
    seasonId: selectedSeasonId ?? undefined,
    enabled: (isAwardsView || isTeamStandingsView) && Boolean(selectedSeasonId),
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
    if (isAwardsView) {
      return <SeasonAwardsSkeleton />;
    }
    if ((standingsType ?? "overall") === "playoff") {
      return <PlayoffBracketSkeleton />;
    }
    if ((standingsType ?? "overall") === "power") {
      return <PowerRankingsSkeleton />;
    }
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
        matchups={matchups}
        teams={teams}
        stats={stats}
        season={selectedSeason ?? null}
      />
    );
  }

  if ((standingsType ?? "overall") === "power") {
    return (
      <PowerRankings season={selectedSeason ?? null} rankings={powerRankings} />
    );
  }

  return (
    <StandingsTable
      groups={groups}
      matchups={matchups}
      weeks={weeks}
      allTeams={teams}
      allTeamStats={stats}
      players={players}
      playerTotals={playerTotalsQuery.totals}
      selectedSeason={selectedSeason ?? null}
      standingsType={standingsType ?? "overall"}
    />
  );
}
