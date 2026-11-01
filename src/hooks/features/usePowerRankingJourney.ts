"use client";

import { useState } from "react";
import type { PowerRankingsViewModel } from "@gshl-types";
import { useAuthSession } from "../main/useAuthSession";
import { buildPowerRankingJourney } from "@gshl-utils/features/power-rankings";

export function usePowerRankingJourney(rankings: PowerRankingsViewModel) {
  const { session } = useAuthSession();
  const [selectedTeamId, selectTeam] = useState<string | null>(null);
  return {
    ...buildPowerRankingJourney(
      rankings,
      session?.user.ownerId,
      selectedTeamId,
    ),
    selectTeam,
  };
}
