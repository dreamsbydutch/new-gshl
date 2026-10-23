"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useNhlPlayerTalent(seasonStartYear: number | null) {
  const seasons = useQuery(api.nhlContractAnalytics.rosterSeasons, {});
  const selected =
    seasons?.find((row) => row.seasonStartYear === seasonStartYear) ??
    seasons?.at(-1);
  const population = useQuery(
    api.nhlContractAnalytics.talentSeason,
    selected ? { seasonId: selected.id, includePlayers: true } : "skip",
  );
  return { seasons, selected, population };
}
