"use client";

import { useMemo } from "react";
import { selectDraftTeams } from "@gshl-utils/features/draft-hub";
import { useAuthSession } from "../main/useAuthSession";
import { useNav } from "../main/useNav";
import { useTeams } from "../main/useTeam";
import { useDraftSeason } from "./useDraftSeason";

export function useDraftTeamSelection(
  mode: "my-team" | "other-team" = "my-team",
) {
  const { session, status: authStatus } = useAuthSession();
  const { selectedOwnerId } = useNav();
  const { seasons, season, isLoading: seasonsLoading } = useDraftSeason();
  const teamsQuery = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const viewerOwnerId = session?.user.ownerId;
  const targetOwnerId = mode === "my-team" ? viewerOwnerId : selectedOwnerId;
  const selection = useMemo(
    () => selectDraftTeams(teamsQuery.data, viewerOwnerId, targetOwnerId),
    [teamsQuery.data, viewerOwnerId, targetOwnerId],
  );
  return {
    ...selection,
    season,
    seasons,
    teams: teamsQuery.data,
    viewerOwnerId,
    isLoading:
      seasonsLoading || teamsQuery.isLoading || authStatus === "loading",
  };
}
