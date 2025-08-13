"use client";
import { useStandingsNavigation } from "@gshl-cache";
import { StandingsContainer } from "@gshl-components/StandingsContainer";

export default function Standings() {
  const { selectedType } = useStandingsNavigation();

  return <StandingsContainer standingsType={selectedType ?? "overall"} />;
}
