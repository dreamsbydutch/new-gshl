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
// APPLICATION-SPECIFIC TYPES
// ============================================================================

/**
 * Enhanced types that extend database models with computed properties
 * - FranchisePlus: Franchise with conference relationship and team ID
 * - Additional composite types for UI and business logic
 */
export * from "./app";

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
