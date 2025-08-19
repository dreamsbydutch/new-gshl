import type { Contract, DraftPick, GSHLTeam, Player } from "@gshl-types";

/**
 * Props accepted by TeamDraftPickList orchestrator component.
 * All collections are optional to allow skeleton fallback semantics.
 */
export interface TeamDraftPickListProps {
  teams: GSHLTeam[] | undefined;
  /** Optional full multi-season team set (improves cross-season mapping when dropdown changes season) */
  allTeams?: GSHLTeam[] | undefined;
  draftPicks: DraftPick[] | undefined;
  contracts: Contract[] | undefined;
  players: Player[] | undefined;
  /** Target GSHL team id whose picks we want to show */
  gshlTeamId: number;
  /** Optional explicit season to view (overrides automatically chosen nextSeason) */
  selectedSeasonId?: number;
}

/**
 * View model for a single rendered draft pick item (available or selected).
 */
export interface ProcessedDraftPick {
  draftPick: DraftPick;
  originalTeam?: GSHLTeam;
  isAvailable: boolean;
  selectedPlayer?: Player;
}

/**
 * Props for DraftPickItem presentational component.
 * Receives fully-derived processedPick to avoid internal logic.
 */
export interface DraftPickItemProps {
  processedPick: ProcessedDraftPick;
  teams: GSHLTeam[];
}
