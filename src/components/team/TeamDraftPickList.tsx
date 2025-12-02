"use client";

/**
 * @fileoverview Team Draft Pick List Component
 *
 * Displays a team's draft picks with season selection, showing both
 * available picks and already-selected players. Includes pick details
 * like round, overall number, and original team if traded.
 *
 * Uses `useTeamDraftPickListData` hook for all data processing and
 * presentation utilities for formatting.
 *
 * @module components/team/TeamDraftPickList
 */

import { useEffect, useState } from "react";
import { DraftPickListSkeleton } from "@gshl-skeletons";
import { DropdownToggle } from "@gshl-nav";
import type { TeamDraftPickListProps, DraftPickItemProps } from "@gshl-utils";
import { formatDraftPickDescription, getOriginalTeamName } from "@gshl-utils";
import type { Season } from "@gshl-types";
import { useTeamDraftPickListData } from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * DraftPickItem Component
 *
 * Presentational row-like block for a single draft pick.
 * Renders either availability (round/overall + optional via) or the selected player details.
 * All derivation (original team lookup, selection logic) occurs upstream in the hook.
 */
const DraftPickItem = ({ processedPick, teams }: DraftPickItemProps) => {
  const { draftPick, originalTeam, isAvailable, selectedPlayer } =
    processedPick;

  if (isAvailable) {
    return (
      <div className="text-gray-800">
        <div className="mx-auto w-5/6 border-t border-gray-300 px-2 py-1 text-center text-xs">
          {formatDraftPickDescription(draftPick)}
          {getOriginalTeamName(teams, originalTeam)}
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-400">
      <div className="mx-auto w-5/6 border-t border-gray-300 px-2 py-1 text-center text-xs">
        {selectedPlayer?.fullName}, {selectedPlayer?.nhlPos.toString()} (
        {formatDraftPickDescription(draftPick)})
      </div>
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * TeamDraftPickList Component
 *
 * Displays a team's draft picks with season selection and availability status.
 * Shows both available picks and already-selected players with full details.
 *
 * **Component Responsibilities:**
 * - Manage local season selection state
 * - Display skeleton during data loading
 * - Render list of draft picks with availability status
 * - Provide season selection dropdown
 *
 * **Data Flow:**
 * - Uses `useTeamDraftPickListData` hook for data processing
 * - Hook handles: pick sorting, availability calculation, player lookups
 * - Component handles: rendering and local UI state
 *
 * @param teams - Teams for the selected season
 * @param allTeams - All teams across all seasons
 * @param draftPicks - All draft picks
 * @param contracts - Player contracts
 * @param players - All players
 * @param seasons - Optional season list for filtering
 * @param gshlTeamId - The team ID to display picks for
 * @param selectedSeasonId - Initially selected season
 * @returns Draft pick list with season selector
 *
 * @example
 * ```tsx
 * <TeamDraftPickList
 *   teams={seasonTeams}
 *   draftPicks={picks}
 *   players={players}
 *   gshlTeamId={teamId}
 * />
 * ```
 */
export function TeamDraftPickList({
  teams,
  allTeams,
  draftPicks,
  contracts,
  players,
  seasons, // optional: used to scope to next upcoming draft / historical selection
  gshlTeamId,
  selectedSeasonId,
}: TeamDraftPickListProps & { seasons?: Season[] }) {
  // Local (component-scoped) season selection so the toggle only affects this list.
  const [localSeasonId, setLocalSeasonId] = useState<string | undefined>(
    selectedSeasonId,
  );

  // If no explicit season provided, default to most recent season (by startDate)
  useEffect(() => {
    if (localSeasonId != null) return;
    if (!seasons?.length) return;
    const mostRecent = [...seasons].sort((a, b) => {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    })[0];
    if (mostRecent) setLocalSeasonId(mostRecent.id);
  }, [seasons, localSeasonId]);

  const { processedDraftPicks, ready } = useTeamDraftPickListData({
    teams,
    draftPicks,
    contracts,
    players,
    seasons,
    gshlTeamId,
    selectedSeasonId: localSeasonId,
    allTeams,
  });
  if (!ready) return <DraftPickListSkeleton />;

  return (
    <>
      <div className="mx-auto mt-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 py-3 text-xl font-bold">
          {seasons && seasons.length > 0 && localSeasonId != null && (
            <DropdownToggle
              items={[...seasons].sort((a, b) => {
                return (
                  new Date(b.startDate).getTime() -
                  new Date(a.startDate).getTime()
                );
              })}
              selectedItem={seasons.find((s) => s.id === localSeasonId)}
              onSelect={(s: Season) => setLocalSeasonId(s.id)}
              getItemKey={(s: Season) => String(s.id)}
              getItemLabel={(s: Season) => s.name}
              className="min-w-28 bg-white text-base"
              dropdownPosition="auto"
            />
          )}
          <span>Draft Picks</span>
        </div>
      </div>
      {processedDraftPicks.length === 0 && (
        <div className="mt-2 text-center text-sm text-muted-foreground">
          No draft picks found.
        </div>
      )}
      {processedDraftPicks.map((processedPick) => {
        const { draftPick } = processedPick;
        const key = draftPick.id ?? `${draftPick.round}-${draftPick.pick}`;
        return (
          <DraftPickItem
            key={key}
            processedPick={processedPick}
            teams={teams}
          />
        );
      })}
    </>
  );
}
