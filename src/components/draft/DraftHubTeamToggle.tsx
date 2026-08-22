"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useNav, useTeamNavigation, useTeams } from "@gshl-hooks";
import { HorizontalToggle } from "../nav/Toggle";
import { TeamsToggleSkeleton } from "@gshl-skeletons";
import type { DraftHubTeamToggleProps, GSHLTeam } from "@gshl-types";

export function DraftHubTeamToggle({
  seasonId,
  excludedOwnerId,
  isLoading: isLoadingOverride,
  teams: teamsOverride,
  selectedOwnerId: selectedOwnerIdOverride,
  onSelectOwner,
}: DraftHubTeamToggleProps) {
  const { selectedOwnerId: storedOwnerId } = useNav();
  const { setSelectedOwnerId } = useTeamNavigation();
  const { data: teamRows = [], isLoading } = useTeams({
    seasonId,
    enabled: teamsOverride === undefined && Boolean(seasonId),
  });
  const selectedOwnerId =
    selectedOwnerIdOverride !== undefined
      ? selectedOwnerIdOverride
      : storedOwnerId;
  const teams = useMemo(
    () =>
      ([...(teamsOverride ?? (teamRows as GSHLTeam[]))] as GSHLTeam[])
        .filter(
          (team) =>
            !excludedOwnerId ||
            String(team.ownerId) !== String(excludedOwnerId),
        )
        .sort((left, right) =>
          String(left.name ?? "").localeCompare(String(right.name ?? "")),
        ),
    [excludedOwnerId, teamRows, teamsOverride],
  );
  const selectedTeam =
    teams.find((team) => String(team.ownerId) === selectedOwnerId) ?? null;

  if (isLoadingOverride ?? isLoading) return <TeamsToggleSkeleton />;

  return (
    <HorizontalToggle<GSHLTeam>
      items={teams}
      selectedItem={selectedTeam}
      onSelect={(team) => {
        if (!team.ownerId) return;
        if (onSelectOwner) {
          onSelectOwner(String(team.ownerId));
          return;
        }
        setSelectedOwnerId(String(team.ownerId));
      }}
      getItemKey={(team) => team.id}
      getItemLabel={(team) => team.name ?? "Team"}
      renderCustomItem={(team) =>
        team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="h-8 w-8 rounded object-contain"
          />
        ) : (
          <span className="grid h-8 w-8 place-items-center text-xs font-bold">
            {team.abbr ?? "?"}
          </span>
        )
      }
      className="px-2"
    />
  );
}
