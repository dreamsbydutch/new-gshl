"use client";

import { PlayoffBracket, StandingsComponent } from "@gshl-components/league";
import { useStandingsData } from "@gshl-hooks";
import { StandingsSkeleton } from "@gshl-skeletons";

export function StandingsContent() {
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
