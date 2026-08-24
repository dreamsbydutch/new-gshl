"use client";

/**
 * @fileoverview Team Draft Pick List Component
 *
 * Displays a team's draft picks for a selected draft season, showing both
 * available picks and already-selected players. Includes pick details
 * like round, overall number, and original team if traded.
 *
 * Uses `useTeamDraftPickListData` hook for all data processing and
 * presentation utilities for formatting.
 *
 * @module components/team/TeamDraftPickList
 */

import { useMemo } from "react";
import { DraftPickListSkeleton } from "@gshl-skeletons";
import type {
  DraftPickItemProps,
  Season,
  TeamDraftPickListProps,
} from "@gshl-types";
import {
  buildSyntheticSeason,
  formatDraftPickDescription,
  getOriginalTeamName,
} from "@gshl-utils";
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
        {selectedPlayer?.fullName}, {selectedPlayer?.nhlPos?.toString() ?? ""} (
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
 * Displays a team's draft picks for the selected draft season.
 * Shows both available picks and already-selected players with full details.
 *
 * **Component Responsibilities:**
 * - Display skeleton during data loading
 * - Render list of draft picks with availability status
 *
 * **Data Flow:**
 * - Uses `useTeamDraftPickListData` hook for data processing
 * - Hook handles: pick sorting, availability calculation, player lookups
 * - Component handles rendering
 *
 * @param teams - Teams for the selected season
 * @param allTeams - All teams across all seasons
 * @param draftPicks - All draft picks
 * @param contracts - Player contracts
 * @param players - All players
 * @param seasons - Optional season list for filtering
 * @param gshlTeamId - The team ID to display picks for
 * @param selectedSeasonId - Selected draft season
 * @returns Draft pick list for the selected season
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
  isLoading = false,
  onSelectSeason,
}: TeamDraftPickListProps & { seasons?: Season[] }) {
  const seasonOptions = useMemo<Season[]>(() => {
    const knownSeasons = [...(seasons ?? [])].sort(
      (a, b) => Number(a.id) - Number(b.id),
    );
    const seasonIdsFromPicks = Array.from(
      new Set((draftPicks ?? []).map((pick) => String(pick.seasonId ?? ""))),
    )
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));

    if (!knownSeasons.length) return knownSeasons;

    const seasonsById = new Map(
      knownSeasons.map((season) => [season.id, season]),
    );
    const orderedSeasons = [...knownSeasons];

    for (const seasonId of seasonIdsFromPicks) {
      if (seasonsById.has(seasonId)) continue;

      const previousSeason = orderedSeasons[orderedSeasons.length - 1];
      if (!previousSeason) continue;

      const syntheticSeason = buildSyntheticSeason(previousSeason, seasonId);
      orderedSeasons.push(syntheticSeason);
      seasonsById.set(seasonId, syntheticSeason);
    }

    return orderedSeasons;
  }, [draftPicks, seasons]);
  const displaySeasonOptions = useMemo(
    () => [...seasonOptions].sort((a, b) => Number(b.year) - Number(a.year)),
    [seasonOptions],
  );

  const { processedDraftPicks, ready } = useTeamDraftPickListData({
    teams,
    draftPicks,
    contracts,
    players,
    seasons: seasonOptions,
    gshlTeamId,
    selectedSeasonId,
    allTeams,
  });
  if (!ready) return <DraftPickListSkeleton />;

  return (
    <>
      <div className="mx-auto mt-4 flex items-center justify-center gap-2 py-3">
        <h2 className="text-xl font-bold">Draft Picks</h2>
        {onSelectSeason ? (
          <label>
            <span className="sr-only">Draft season</span>
            <select
              aria-label="Draft season"
              value={selectedSeasonId}
              onChange={(event) => onSelectSeason(event.target.value)}
              className="h-8 min-w-24 rounded-md border border-slate-300 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 motion-reduce:transition-none"
            >
              {displaySeasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div aria-busy={isLoading}>
        {isLoading ? (
          <DraftPickListSkeleton showHeader={false} />
        ) : (
          <>
            {processedDraftPicks.length === 0 && (
              <div className="mt-2 text-center text-sm text-muted-foreground">
                No draft picks found.
              </div>
            )}
            {processedDraftPicks.map((processedPick) => {
              const { draftPick } = processedPick;
              const key =
                draftPick.id ?? `${draftPick.round}-${draftPick.pick}`;
              return (
                <DraftPickItem
                  key={key}
                  processedPick={processedPick}
                  teams={teams}
                />
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
