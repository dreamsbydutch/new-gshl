"use client";

import { useMemo } from "react";
import type { UseTeamDraftPickListDataOptions } from "@gshl-types";
import { buildTeamDraftPickList } from "@gshl-utils/features/team-draft-pick-list";

export function useTeamDraftPickListData(
  options: UseTeamDraftPickListDataOptions = {},
) {
  const {
    teams,
    allTeams,
    draftPicks,
    players,
    seasons,
    gshlTeamId,
    selectedSeasonId,
  } = options;
  return useMemo(
    () =>
      buildTeamDraftPickList({
        teams,
        allTeams,
        draftPicks,
        players,
        seasons,
        gshlTeamId,
        selectedSeasonId,
      }),
    [
      teams,
      allTeams,
      draftPicks,
      players,
      seasons,
      gshlTeamId,
      selectedSeasonId,
    ],
  );
}
