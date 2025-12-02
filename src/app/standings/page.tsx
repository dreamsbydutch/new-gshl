"use client";
import { StandingsComponent } from "@gshl-components/league";
import { useStandingsData } from "@gshl-hooks";

export default function Standings() {
  const { selectedSeason, groups, standingsType } = useStandingsData({});

  return (
    <>
      {groups.map((group) => (
        <StandingsComponent
          key={group.title}
          group={group}
          selectedSeason={selectedSeason ?? null}
          standingsType={standingsType ?? "overall"}
        />
      ))}
    </>
  );
}
