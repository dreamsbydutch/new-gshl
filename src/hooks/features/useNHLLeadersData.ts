"use client";

import { useState } from "react";
import { useNHLLeaders } from "../main/useNHL";
import {
  selectNHLLeaders,
  selectQualifiedNHLGoalies,
} from "@gshl-utils/features/nhl-leaders";
import type { NHLLeaderStat } from "@gshl-lib/types/nhl-leaders";

export function useNHLLeadersData(
  seasonId: number | undefined,
  maxTeamGamesPlayed: number,
) {
  const resource = useNHLLeaders(seasonId);
  const [skaterSort, setSkaterSort] = useState<NHLLeaderStat>("P");
  const [goalieSort, setGoalieSort] = useState<NHLLeaderStat>("W");
  return {
    ...resource,
    skaters: selectNHLLeaders(resource.data?.skaters ?? [], skaterSort, 100),
    goalies: selectQualifiedNHLGoalies(
      resource.data?.goalies ?? [],
      goalieSort,
      maxTeamGamesPlayed,
    ),
    skaterSort,
    goalieSort,
    setSkaterSort,
    setGoalieSort,
  };
}
