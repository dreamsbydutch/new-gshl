"use client";

import { useAppPathname } from "../main/useNextNavigation";
import { useDraftTeamsContextNavigation } from "./useContextualNavigation";
import { useDraftTeamSelection } from "./useDraftTeamSelection";

export function useDraftHubNavigation() {
  const { pathname } = useAppPathname();
  const selection = useDraftTeamSelection();
  const navigation = useDraftTeamsContextNavigation({
    excludedOwnerId: selection.viewerOwnerId,
    isLoading: selection.isLoading,
    teams: selection.teams,
  });
  const links = [
    {
      href: navigation.draftHref,
      label: "Board",
      kind: "board" as const,
      isActive: pathname === "/draft",
    },
    ...(selection.ownTeam
      ? [
          {
            href: navigation.myTeamHref,
            label: "My team",
            kind: "mine" as const,
            isActive: pathname === "/draft/my-team",
          },
        ]
      : []),
    {
      href: navigation.teamsHref,
      label: "Teams",
      kind: "teams" as const,
      isActive: navigation.isTeamsPage,
    },
  ];
  return {
    ...navigation,
    season: selection.season,
    isLoading: selection.isLoading,
    links,
  };
}
