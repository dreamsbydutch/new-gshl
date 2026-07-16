"use client";

import {
  AwardsShowcase,
  PlayoffBracket,
  StandingsComponent,
} from "@gshl-components/league";
import {
  usePlayerAwards,
  usePlayers,
  useStandingsData,
  useTeamAwards,
  useTeams,
} from "@gshl-hooks";
import { StandingsSkeleton } from "@gshl-skeletons";
import { useSeasonNavigation, useStandingsNavigation } from "@gshl-cache";
import type { GSHLTeam } from "@gshl-types";

export function StandingsContent() {
  const { selectedType } = useStandingsNavigation();
  if (selectedType === "awards") return <StandingsAwards />;
  return <StandingsTables />;
}

function StandingsTables() {
  const {
    selectedSeason,
    groups,
    standingsType,
    teams,
    stats,
    matchups,
    weeks,
    isLoading,
  } = useStandingsData({});

  if (isLoading) {
    return <StandingsSkeleton />;
  }

  if ((standingsType ?? "overall") === "playoff") {
    return <PlayoffBracket teams={teams} stats={stats} />;
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

function StandingsAwards() {
  const { selectedSeasonId } = useSeasonNavigation();
  const enabled = Boolean(selectedSeasonId);
  const { data: playerAwards, isLoading: playerAwardsLoading } =
    usePlayerAwards({
      seasonId: selectedSeasonId,
      enabled,
    });
  const { data: teamAwards, isLoading: teamAwardsLoading } = useTeamAwards({
    seasonId: selectedSeasonId,
    enabled,
  });
  const { data: players, isLoading: playersLoading } = usePlayers({ enabled });
  const { data: teams, isLoading: teamsLoading } = useTeams({
    seasonId: selectedSeasonId,
    enabled,
  });

  if (
    !enabled ||
    playerAwardsLoading ||
    teamAwardsLoading ||
    playersLoading ||
    teamsLoading
  ) {
    return <StandingsSkeleton />;
  }

  return (
    <AwardsShowcase
      playerAwards={playerAwards}
      teamAwards={teamAwards}
      players={players}
      teams={teams as GSHLTeam[]}
    />
  );
}
