"use client";

import Image from "next/image";
import { HorizontalToggle } from "../nav/Toggle";
import { TeamsToggleSkeleton } from "@gshl-skeletons";
import type { DraftHubTeamToggleProps, GSHLTeam } from "@gshl-types";

export function DraftHubTeamToggle({
  isLoading,
  teams,
  selectedTeam,
  onSelectOwner,
}: DraftHubTeamToggleProps) {
  if (isLoading) return <TeamsToggleSkeleton />;

  return (
    <HorizontalToggle<GSHLTeam>
      items={teams}
      selectedItem={selectedTeam}
      onSelect={(team) => {
        if (!team.ownerId) return;
        onSelectOwner(String(team.ownerId));
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
