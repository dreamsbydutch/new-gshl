/**
 * GSHL Utility Functions Barrel Exports
 *
 * This module provides a centralized export point for all utility functions
 * used throughout the GSHL fantasy hockey league application.
 */

// ============================================================================
// DATE & TIME UTILITIES
// ============================================================================

/**
 * Date manipulation and formatting functions
 * - formatDate: Convert Date objects to YYYY-MM-DD format
 * - parseSheetDate: Parse Google Sheets date strings safely
 * - formatSheetDate: Format dates for Google Sheets compatibility
 * - getCurrentSeason: Calculate current hockey season year
 * - getSeasonString: Format season as "2024-25" string
 * - isWithinDateRange: Check if date falls within a range
 */
export * from "./date";

// ============================================================================
// FORMATTING & DISPLAY UTILITIES
// ============================================================================

/**
 * Data formatting and display helper functions
 * - cn: Combine and merge Tailwind CSS classes safely
 * - formatMoney: Display numbers as currency ($1,234)
 * - formatNumber: Display numbers with thousand separators
 * - formatPercentage: Display numbers as percentages (12.3%)
 * - formatPlayerName: Standardize player name display
 * - truncateText: Truncate long text with ellipsis
 */
export * from "./format";

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Input validation and data integrity functions
 * - isValidEmail: Email format validation
 * - isValidYear: Hockey season year validation
 * - isValidSalary: Salary cap validation
 * - isValidJerseyNumber: Jersey number validation (1-99)
 * - isValidPosition: Hockey position validation
 * - isValidTeamName: Team name format and length validation
 */
export * from "./validation";

// ============================================================================
// MATHEMATICAL CALCULATIONS
// ============================================================================

/**
 * Hockey league specific calculations
 * - calculateCapSpace: Remaining salary cap space
 * - calculateCapPercentage: Salary cap usage percentage
 * - calculatePlayerAge: Age calculation from birth date
 * - calculateStatTotals: Sum player statistics across periods
 * - calculateTeamRecord: Win/loss record calculations
 * - calculateStandings: League standings and rankings
 */
export * from "./calculations";

// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================

/**
 * Configuration constants and application settings
 * - APP_CONFIG: Application metadata and branding
 * - API_CONFIG: API settings (page sizes, timeouts)
 * - VALIDATION_RULES: Input validation constraints
 * - UI_CONFIG: UI behavior settings (toast duration, debounce)
 * - LEAGUE_SETTINGS: Hockey league specific constants
 */
export * from "./constants";

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Common import patterns:
 *
 * // Import specific utilities
 * import { formatMoney, formatDate } from "@gshl-utils";
 * import { cn } from "@gshl-utils"; // Most common - Tailwind class merging
 *
 * // Import validation functions
 * import { isValidEmail, isValidSalary } from "@gshl-utils";
 *
 * // Import calculations
 * import { calculateCapSpace, calculatePlayerAge } from "@gshl-utils";
 *
 * // Import constants
 * import { APP_CONFIG, VALIDATION_RULES } from "@gshl-utils";
 *
 * // Example usage in components
 * const capSpaceDisplay = formatMoney(calculateCapSpace(contracts));
 * const playerAgeDisplay = calculatePlayerAge(player.birthDate);
 * const buttonClasses = cn("btn", isActive && "btn-active");
 */


export * from "./uploadthing";