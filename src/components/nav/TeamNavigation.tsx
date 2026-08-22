"use client";

/**
 * Team Navigation Component
 *
 * Self-contained team selection interface that fetches teams for the current season
 * and manages selection state through the navigation store.
 */

import type { GSHLTeam, TeamsToggleProps } from "@gshl-types";
import { useNav, useTeamNavigation, useTeams } from "@gshl-hooks";
import { TeamsToggleSkeleton } from "@gshl-skeletons";
import { HorizontalToggle } from "./Toggle";
import Image from "next/image";

/**
 * Team selection toggle component with franchise logos
 * @param props - Component props
 * @returns Team selection interface with horizontal toggle
 */
export function TeamsToggle({
  className,
  seasonId,
  selectedOwnerId: selectedOwnerIdOverride,
  onSelectOwner,
}: TeamsToggleProps) {
  const { selectedSeasonId: storeSeasonId } = useNav();
  const selectedSeasonId = seasonId !== undefined ? seasonId : storeSeasonId;
  const { selectedOwnerId: storedOwnerId, setSelectedOwnerId: setOwnerId } =
    useTeamNavigation();
  const selectedOwnerId =
    selectedOwnerIdOverride !== undefined
      ? selectedOwnerIdOverride
      : storedOwnerId;

  const {
    data: teamsRaw = [],
    isLoading,
    error,
  } = useTeams({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });
  const teams = teamsRaw as GSHLTeam[];

  const selectedTeam = teams.find((t) => t.ownerId === selectedOwnerId) ?? null;

  const handleTeamSelect = (team: GSHLTeam) => {
    if (team.ownerId) {
      if (onSelectOwner) {
        onSelectOwner(team.ownerId);
        return;
      }
      setOwnerId(team.ownerId);
    }
  };

  const getTeamKey = (team: GSHLTeam) => team.id.toString();

  const getTeamLabel = (team: GSHLTeam) => team.name ?? `Team ${team.id}`;

  const renderTeamItem = (team: GSHLTeam) =>
    team.logoUrl ? (
      <Image
        src={team.logoUrl}
        alt=""
        aria-hidden="true"
        height={32}
        width={32}
        className="h-8 w-8 rounded object-contain"
      />
    ) : (
      <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100">
        <span className="text-xs text-gray-400">?</span>
      </div>
    );

  if (!selectedSeasonId || isLoading) {
    return <TeamsToggleSkeleton className={className} />;
  }

  return (
    <HorizontalToggle<GSHLTeam>
      items={[...teams]
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .sort((a, b) => (b.confName ?? "").localeCompare(a.confName ?? ""))}
      selectedItem={selectedTeam}
      onSelect={handleTeamSelect}
      getItemKey={getTeamKey}
      getItemLabel={getTeamLabel}
      renderCustomItem={renderTeamItem}
      error={error?.message ?? null}
      className={className}
    />
  );
}
