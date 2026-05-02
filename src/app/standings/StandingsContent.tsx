"use client";

import { PlayoffBracket, StandingsComponent } from "@gshl-components/league";
import { useStandingsData } from "@gshl-hooks";

export function StandingsContent() {
  const {
    selectedSeason,
    groups,
    standingsType,
    teams,
    stats,
    matchups,
    weeks,
  } = useStandingsData({});

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
