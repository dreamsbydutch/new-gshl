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
// UI COMPONENT TYPES
// ============================================================================

/**
 * Type definitions for UI components and their props
 * - ContractTable: Contract management table props
 * - DraftBoardList: Draft board filtering and display props
 * - LockerRoomHeader: Team header display props
 * - Standings: Standings display and grouping props
 * - TeamDraftPickList: Draft pick list props
 * - TeamHistory: Team matchup history props
 * - TeamRoster: Team roster display props
 * - TeamSchedule: Schedule display props
 * - WeeklySchedule: Week-based schedule props
 */
export * from "./ui-components";

// ============================================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================================

/**
 * Types specific to Google Sheets data storage and retrieval
 * - WorkbookConfig: Configuration for multiple Google Sheets workbooks
 * - SheetConfig: Individual sheet naming and structure
 * - FieldTransforms: Data transformation rules for different field types
 * - ModelTransforms: Model-specific transformation configurations
 * - Google Sheets API response types and interfaces
 */
export * from "./sheets";

// ============================================================================
// DATA TRANSFORMATION TYPES
// ============================================================================

/**
 * Transformed versions of database models for sheets adapter compatibility
 * - Aliases and modified versions of core database types
 * - Optimized types for Google Sheets storage format
 * - Ensures type safety during data transformation processes
 */
export * from "./transforms";

// ============================================================================
// NAVIGATION & UI TYPES
// ============================================================================

/**
 * User interface and navigation-specific type definitions
 * - BaseNavItem: Core navigation item structure
 * - Navigation component props and configuration interfaces
 * - UI state management types for consistent component behavior
 * - Positioning, styling, and interaction types
 */
export * from "./nav";

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
 * // Import sheets-specific types for data operations
 * import type { WorkbookConfig, FieldTransforms } from "~/lib/types";
 *
 * // Example usage in component props
 * interface SeasonSelectorProps {
 *   seasons: Season[];
 *   activeSeasonType: SeasonType;
 *   onSeasonChange: (seasonId: number) => void;
 * }
 */
