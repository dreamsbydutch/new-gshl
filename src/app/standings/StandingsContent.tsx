"use client";

import {
  PlayoffBracket,
  SeasonAwards,
  StandingsComponent,
} from "@gshl-components/league";
import { useAwards, usePlayers, usePlayerStats, useStandingsData } from "@gshl-hooks";
import { StandingsSkeleton } from "@gshl-skeletons";

export function StandingsContent() {
  const {
    selectedSeason,
    selectedSeasonId,
    groups,
    standingsType,
    teams,
    stats,
    matchups,
    weeks,
    isLoading,
  } = useStandingsData({});
  const isAwardsView = (standingsType ?? "overall") === "awards";

  const { data: seasonAwards = [], isLoading: awardsLoading } = useAwards({
    seasonId: selectedSeasonId ?? undefined,
    enabled: isAwardsView && Boolean(selectedSeasonId),
    orderBy: { award: "asc" },
  });
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
      (awardsLoading || playersLoading || playerTotalsQuery.status.isLoading))
  ) {
    return <StandingsSkeleton />;
  }

  if (isAwardsView) {
    return (
      <SeasonAwards
        awards={seasonAwards}
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
    <>
      {groups.map((group) => (
        <StandingsComponent
          key={group.title}
          group={group}
          selectedSeason={selectedSeason ?? null}
          standingsType={standingsType ?? "overall"}
          matchups={matchups}
          weeks={weeks}
        />
      ))}
    </>
  );
}
