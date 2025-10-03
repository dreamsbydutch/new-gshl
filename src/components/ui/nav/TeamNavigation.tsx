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

interface TeamsToggleProps {
  className?: string;
  seasonId?: string;
}

/**
 * Team selection toggle component with franchise logos
 * @param props - Component props
 * @returns Team selection interface with horizontal toggle
 */
export function TeamsToggle({ className, seasonId }: TeamsToggleProps) {
  const storeSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedSeasonId = seasonId ?? storeSeasonId;
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);

  const {
    data: teams,
    isLoading,
    error,
  } = useTeamsBySeasonId((selectedSeasonId));

  const selectedTeam = teams.find((t) => t.ownerId === selectedOwnerId) ?? null;

  const handleTeamSelect = (team: GSHLTeam) => {
    if (team.ownerId) {
      setOwnerId(team.ownerId);
    }
  };

  const getTeamKey = (team: GSHLTeam) => team.id.toString();

  const getTeamLabel = (team: GSHLTeam) => team.name ?? `Team ${team.id}`;

  const renderTeamItem = (team: GSHLTeam) =>
    team.logoUrl ? (
      <Image
        src={team.logoUrl}
        alt={`${team.name} logo`}
        height={32}
        width={32}
        className="h-8 w-8 rounded-md p-1"
      />
    ) : (
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-200 p-1">
        <span className="text-xs text-gray-400">?</span>
      </div>
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
      error={error?.message ?? null}
      className={className}
    />
  );
}
