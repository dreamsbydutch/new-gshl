"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { useNav, useTeamNavigation, useTeams } from "@gshl-hooks";
import { HorizontalToggle } from "../nav/Toggle";
import { TeamsToggleSkeleton } from "@gshl-skeletons";
import type { DraftHubTeamToggleProps, GSHLTeam } from "@gshl-types";

export function DraftHubTeamToggle({
  seasonId,
  excludedOwnerId,
}: DraftHubTeamToggleProps) {
  const { selectedOwnerId } = useNav();
  const { setSelectedOwnerId } = useTeamNavigation();
  const { data: teamRows = [], isLoading } = useTeams({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const teams = useMemo(
    () =>
      (teamRows as GSHLTeam[])
        .filter(
          (team) =>
            !excludedOwnerId ||
            String(team.ownerId) !== String(excludedOwnerId),
        )
        .sort((left, right) =>
          String(left.name ?? "").localeCompare(String(right.name ?? "")),
        ),
    [excludedOwnerId, teamRows],
  );
  const selectedTeam =
    teams.find((team) => String(team.ownerId) === selectedOwnerId) ?? null;

  useEffect(() => {
    if (!selectedTeam && teams[0]?.ownerId) {
      setSelectedOwnerId(String(teams[0].ownerId));
    }
  }, [selectedTeam, setSelectedOwnerId, teams]);

  if (isLoading) return <TeamsToggleSkeleton />;

  return (
    <HorizontalToggle<GSHLTeam>
      items={teams}
      selectedItem={selectedTeam}
      onSelect={(team) => {
        if (team.ownerId) setSelectedOwnerId(String(team.ownerId));
      }}
      getItemKey={(team) => team.id}
      getItemLabel={(team) => team.name ?? "Team"}
      renderCustomItem={(team) =>
        team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt={`${team.name ?? "Team"} logo`}
            width={34}
            height={34}
            className="h-9 w-9 rounded-md object-contain p-1"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center text-xs font-bold">
            {team.abbr ?? "?"}
          </span>
        )
      }
      className="px-2"
    />
  );
}
