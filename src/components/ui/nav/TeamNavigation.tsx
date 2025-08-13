"use client";

/**
 * Team Navigation Component
 *
 * Self-contained team selection interface that fetches teams for the current season
 * and manages selection state through the navigation store.
 */

import type { GSHLTeam } from "@gshl-types";
import { useNavStore } from "@gshl-cache";
import { useTeamsBySeasonId } from "@gshl-hooks";
import { HorizontalToggle } from "./toggle";
import Image from "next/image";
import { cn } from "@gshl-utils";

interface TeamsToggleProps {
  className?: string;
}

/**
 * Team selection toggle component with franchise logos
 * @param props - Component props
 * @returns Team selection interface with horizontal toggle
 */
export function TeamsToggle({ className }: TeamsToggleProps) {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);

  const {
    data: teams,
    isLoading,
    error,
  } = useTeamsBySeasonId(selectedSeasonId);

  const selectedTeam = teams.find((t) => t.ownerId === selectedOwnerId) || null;

  const handleTeamSelect = (team: GSHLTeam) => {
    if (team.ownerId) {
      setOwnerId(team.ownerId);
    }
  };

  const getTeamKey = (team: GSHLTeam) => team.id.toString();

  const getTeamLabel = (team: GSHLTeam) => team.name || `Team ${team.id}`;

  const renderTeamItem = (team: GSHLTeam, isSelected: boolean) => (
    <Image
      src={team.logoUrl ?? ""}
      alt={`${team.name} logo`}
      height={32}
      width={32}
      className="h-8 w-8 rounded-md p-1"
    />
  );

  return (
    <HorizontalToggle<GSHLTeam>
      items={teams
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .sort((a, b) => (b.confName ?? "").localeCompare(a.confName ?? ""))}
      selectedItem={selectedTeam}
      onSelect={handleTeamSelect}
      getItemKey={getTeamKey}
      getItemLabel={getTeamLabel}
      renderCustomItem={renderTeamItem}
      loading={isLoading}
      error={error?.message || null}
      className={className}
    />
  );
}
