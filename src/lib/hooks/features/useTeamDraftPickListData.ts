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
      const coerced = Number(selectedSeasonId);
      const found = normalizedSeasons.find((s) => Number(s.id) === coerced);
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

  /**
   * Resolve season-specific team id (franchise continuity) but NEVER return undefined if a base id is supplied.
   * If teams aren't loaded yet we still proceed with the provided gshlTeamId to avoid empty UI flashes.
   */
  const resolvedTeamId = useMemo(() => {
    if (!gshlTeamId) return undefined; // no baseline supplied
    if (!teams || !activeSeason) return gshlTeamId; // can't map yet – use raw id
    const baseTeam = teams.find((t) => t.id === gshlTeamId);
    if (!baseTeam) return gshlTeamId;
    const seasonTeam = teams.find(
      (t) =>
        t.seasonId === activeSeason.id &&
        t.franchiseId === baseTeam.franchiseId,
    );
    return seasonTeam ? seasonTeam.id : gshlTeamId;
  }, [teams, gshlTeamId, activeSeason]);

  /** Fast lookup maps */
  const playerById = useMemo(() => {
    if (!players) return new Map<string, Player>();
    return new Map(players.map((p) => [p.id, p] as const));
  }, [players]);

  const teamById = useMemo(() => {
    if (!teams) return new Map<string, GSHLTeam>();
    return new Map(teams.map((t) => [t.id, t] as const));
  }, [teams]);

  /** Derive picks */
  const processedDraftPicks = useMemo<ProcessedDraftPick[]>(() => {
    if (!draftPicks || !gshlTeamId) return [];

    // Owner-wide scoping (span multiple franchises if the same owner retained control across seasons)
    const lookupTeams = allTeams ?? teams;
    const baseTeam = lookupTeams?.find((t) => t.id === gshlTeamId);
    const ownerTeamIds =
      baseTeam?.ownerId != null
        ? lookupTeams
            ?.filter((t) => t.ownerId === baseTeam.ownerId)
            .map((t) => t.id)
        : undefined;

    // Start from all picks owned by any owner-associated team id; fallback to resolvedTeamId
    const targetTeamId = resolvedTeamId ?? gshlTeamId;
    let picks = ownerTeamIds
      ? draftPicks.filter((p) => ownerTeamIds.includes(p.gshlTeamId))
      : draftPicks.filter((p) => p.gshlTeamId === targetTeamId);

    // Season filter (explicit user selection vs auto)
    const explicitSelection = selectedSeasonId !== undefined;
    if (activeSeason) {
      const seasonId = activeSeason.id;
      if (explicitSelection) {
        // Always enforce explicit filter, even if it yields zero (lets UI show empty state instead of stale data)
        picks = picks.filter((p) => p.seasonId === seasonId);
      } else {
        // Auto mode (computed) keeps fallback behavior if no season-specific picks yet
        const seasonScoped = picks.filter((p) => p.seasonId === seasonId);
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
    activeSeason,
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
