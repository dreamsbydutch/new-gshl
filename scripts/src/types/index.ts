/**
 * GSHL Application Types Barrel Exports
 *
 * This module provides a centralized export point for all TypeScript type definitions
 * used throughout the GSHL fantasy hockey league application.
 */

// ============================================================================
// CORE DATABASE MODELS
// ============================================================================

/**
 * Primary database model interfaces representing the core entities
 * - Season, Conference, Week: League structure and timing
 * - Team, Player, Owner, Franchise: League participants and hierarchy
 * - Contract, DraftPick: Player management and acquisitions
 * - Matchup, Event: Game scheduling and league events
 * - Statistics models: Performance tracking across multiple dimensions
 */
export * from "./database";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Standardized enums for consistent data representation
 * - RosterPosition: Player roster positions (LW, C, RW, D, G, BN, IR, etc.)
 * - PositionGroup: Simplified position groupings (F, D, G)
 * - SeasonType: Regular season, playoffs, losers tournament phases
 * - MatchupType: Conference, non-conference, playoff matchup types
 * - ContractType: Different contract structures and statuses
 * - EventType: Various league events and activities
 * - AwardsList: Available awards and recognitions
 */
export * from "./enums";

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Common import patterns:
 *
 * // Import specific database models
 * import type { Season, Team, Player } from "~/lib/types";
 *
 * // Import enums for type-safe values
 * import { RosterPosition, SeasonType } from "~/lib/types";
 *
 * // Import enhanced application types
 * import type { FranchisePlus } from "~/lib/types";
 *
 * // Import navigation types for UI components
 * import type { BaseNavItem } from "~/lib/types";
 *
 * // Example usage in component props
 * interface SeasonSelectorProps {
 *   seasons: Season[];
 *   activeSeasonType: SeasonType;
 *   onSeasonChange: (seasonId: number) => void;
 * }
 */
