"use client";

import { useMemo } from "react";
import type {
  Contract,
  DraftPick,
  GSHLTeam,
  Player,
  Season,
} from "@gshl-types";
import type { ProcessedDraftPick } from "@gshl-utils";

/**
 * Options for configuring team draft pick list data.
 */
export interface UseTeamDraftPickListDataOptions {
  /**
   * Loaded GSHL teams (undefined while loading)
   */
  teams?: GSHLTeam[];

  /**
   * Raw draft picks for a team
   */
  draftPicks?: DraftPick[];

  /**
   * Contracts used to infer selected players (mapping pick index)
   * Retained for future advanced mapping if needed
   */
  contracts?: Contract[];

  /**
   * Player entities for lookup when a pick is no longer available
   */
  players?: Player[];

  /**
   * Season data for season filtering
   */
  seasons?: Season[];

  /**
   * GSHL team ID to filter picks for
   */
  gshlTeamId?: string;

  /**
   * Selected season ID for filtering
   */
  selectedSeasonId?: string;

  /**
   * All teams across seasons (for owner-wide scoping)
   */
  allTeams?: GSHLTeam[];
}

/**
 * Result returned by useTeamDraftPickListData.
 */
export interface UseTeamDraftPickListDataResult {
  /**
   * Processed draft picks with availability and player info
   */
  processedDraftPicks: ProcessedDraftPick[];

  /**
   * Whether data is ready
   */
  ready: boolean;

  /**
   * Active season resolved from seasons data
   */
  activeSeason?: Season;

  /**
   * Resolved team ID (season-specific team ID if available)
   */
  resolvedTeamId?: string;

  /**
   * Loading state (always false for this hook as it doesn't fetch)
   */
  isLoading: boolean;

  /**
   * Error state (always null for this hook as it doesn't fetch)
   */
  error: Error | null;
}

/**
 * Hook for processing team draft pick list data.
 * Produces a stable, sorted list of processed draft pick view models.
 * Annotates each pick with availability, originalTeam (if traded), and selectedPlayer when taken.
 *
 * Heavy lifting: lib/utils/features (draft pick processing logic)
 *
 * @param options - Configuration options
 * @returns Processed draft picks with readiness state
 *
 * @example
 * ```tsx
 * const {
 *   processedDraftPicks,
 *   ready,
 *   activeSeason
 * } = useTeamDraftPickListData({
 *   teams: allTeams,
 *   draftPicks: allDraftPicks,
 *   players: allPlayers,
 *   seasons: allSeasons,
 *   gshlTeamId: 'team-123',
 *   selectedSeasonId: 'S15'
 * });
 * ```
 */
export function useTeamDraftPickListData(
  options: UseTeamDraftPickListDataOptions = {},
): UseTeamDraftPickListDataResult {
  const {
    teams,
    draftPicks,
    players,
    seasons,
    gshlTeamId,
    selectedSeasonId,
    allTeams,
  } = options;
  /** Normalize date-like fields in seasons defensively (in case they arrive as strings) */
  const normalizedSeasons = useMemo<Season[] | undefined>(() => {
    if (!seasons) return seasons;
    return seasons.map((s) => ({
      ...s,
      startDate: s.startDate,
      endDate: s.endDate,
    }));
  }, [seasons]);

  /** Active season selection logic */
  const activeSeason = useMemo(() => {
    if (!normalizedSeasons?.length) return undefined;
    if (selectedSeasonId != null) {
      const found = normalizedSeasons.find(
        (s) => String(s.id) === String(selectedSeasonId),
      );
      if (found) return found;
    }
    const now = Date.now();
    const upcoming = normalizedSeasons
      .filter((s) => new Date(s.startDate).getTime() >= now)
      .sort((a, b) => {
        const aTime = new Date(a.startDate).getTime();
        const bTime = new Date(b.startDate).getTime();
        return aTime - bTime;
      });
    if (upcoming.length) return upcoming[0];
    return [...normalizedSeasons].sort((a, b) => {
      const aTime = new Date(a.startDate).getTime();
      const bTime = new Date(b.startDate).getTime();
      return bTime - aTime;
    })[0];
  }, [normalizedSeasons, selectedSeasonId]);

  const activeSeasonId = activeSeason?.id
    ? String(activeSeason.id)
    : selectedSeasonId
      ? String(selectedSeasonId)
      : undefined;

  /**
   * Resolve season-specific team id (franchise continuity) but NEVER return undefined if a base id is supplied.
   * If teams aren't loaded yet we still proceed with the provided gshlTeamId to avoid empty UI flashes.
   */
  const resolvedTeamId = useMemo(() => {
    if (!gshlTeamId) return undefined; // no baseline supplied
    const lookupTeams = allTeams ?? teams;
    if (!lookupTeams?.length || !activeSeasonId) return gshlTeamId;
    const baseTeam = lookupTeams.find(
      (t) => String(t.id) === String(gshlTeamId),
    );
    if (!baseTeam) return gshlTeamId;
    const seasonTeam = lookupTeams.find(
      (t) =>
        String(t.seasonId) === activeSeasonId &&
        String(t.franchiseId) === String(baseTeam.franchiseId),
    );
    return seasonTeam ? seasonTeam.id : gshlTeamId;
  }, [teams, allTeams, gshlTeamId, activeSeasonId]);

  /** Fast lookup maps */
  const playerById = useMemo(() => {
    if (!players) return new Map<string, Player>();
    return new Map(players.map((p) => [p.id, p] as const));
  }, [players]);

  const teamById = useMemo(() => {
    const lookupTeams = allTeams ?? teams;
    if (!lookupTeams) return new Map<string, GSHLTeam>();
    return new Map(lookupTeams.map((t) => [t.id, t] as const));
  }, [teams, allTeams]);

  /** Derive picks */
  const processedDraftPicks = useMemo<ProcessedDraftPick[]>(() => {
    if (!draftPicks || !gshlTeamId) return [];

    const lookupTeams = allTeams ?? teams;
    const baseTeam = lookupTeams?.find((t) => t.id === gshlTeamId);
    const relatedTeamIds = baseTeam
      ? lookupTeams
          ?.filter((team) => {
            if (baseTeam.franchiseId) {
              return String(team.franchiseId) === String(baseTeam.franchiseId);
            }
            if (baseTeam.ownerId != null) {
              return String(team.ownerId) === String(baseTeam.ownerId);
            }
            return false;
          })
          .map((team) => String(team.id))
      : undefined;

    const targetTeamId = resolvedTeamId ?? gshlTeamId;
    let picks = relatedTeamIds?.length
      ? draftPicks.filter((pick) =>
          relatedTeamIds.includes(String(pick.gshlTeamId)),
        )
      : draftPicks.filter(
          (pick) => String(pick.gshlTeamId) === String(targetTeamId),
        );

    const explicitSelection = selectedSeasonId !== undefined;
    if (activeSeasonId) {
      const seasonId = String(activeSeasonId);
      if (explicitSelection) {
        picks = picks.filter((pick) => String(pick.seasonId) === seasonId);
      } else {
        const seasonScoped = picks.filter(
          (pick) => String(pick.seasonId) === seasonId,
        );
        if (seasonScoped.length) {
          picks = seasonScoped;
        }
      }
    }

    // Sort: first by round then by pick number (defensive numeric compare)
    picks = [...picks].sort((a, b) => {
      if (+a.round !== +b.round) return +a.round - +b.round;
      return +a.pick - +b.pick;
    });

    const result = picks.map((draftPick) => {
      const originalTeam =
        draftPick.originalTeamId &&
        draftPick.originalTeamId !== draftPick.gshlTeamId
          ? (teamById.get(draftPick.originalTeamId) ?? undefined)
          : undefined;

      // Availability primarily determined by absence of playerId on the pick
      const playerId = draftPick.playerId ?? undefined;
      const selectedPlayer = playerId ? playerById.get(playerId) : undefined;
      const isAvailable = !playerId;

      // (Optional) Future enhancement: cross-check contracts for mismatches
      // Example (currently passive): if contracts reference a playerId not yet copied to pick.
      // This keeps hook forward-compatible without side-effects now.

      return { draftPick, originalTeam, isAvailable, selectedPlayer };
    });
    // Debug logs removed for production cleanliness.
    return result;
  }, [
    draftPicks,
    gshlTeamId,
    resolvedTeamId,
    activeSeasonId,
    teamById,
    playerById,
    teams,
    selectedSeasonId,
    allTeams,
  ]);

  // Ready once we have draft picks array computed (even if empty array) and a target team id
  const ready = Boolean(draftPicks && (resolvedTeamId ?? gshlTeamId));

  return {
    processedDraftPicks,
    ready,
    activeSeason,
    resolvedTeamId,
    isLoading: false,
    error: null,
  };
}
