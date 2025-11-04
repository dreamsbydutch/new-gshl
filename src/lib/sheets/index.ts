/**
 * Google Sheets Integration Barrel Exports
 *
 * This module provides a centralized export point for all Google Sheets related functionality
 * used throughout the GSHL application for data storage and retrieval.
 *
 * Organized into logical subdirectories:
 * - config: Configuration, workbook mappings, and model metadata
 * - cache: Caching layer with TTL management
 * - client: Low-level Google Sheets API client
 * - adapters: High-level Prisma-like database adapters
 * - playerday: PlayerDay-specific partitioning and validation
 * - migration: Schema migration and data transformation tools
 */

// ============================================================================
// CONFIGURATION & METADATA
// ============================================================================

/**
 * Google Sheets configuration constants and utilities
 * - WORKBOOKS: Maps workbook names to their Google Sheets IDs
 * - MODEL_TO_WORKBOOK: Routes database models to appropriate workbooks
 * - SHEETS_CONFIG: Defines sheet names and column mappings for each model
 * - Model metadata: Cache TTLs and data categorization
 */
export * from "./config";

// ============================================================================
// CACHING LAYER
// ============================================================================

/**
 * Sheet caching with TTL management
 * - Reduces API calls to Google Sheets
 * - Automatic cache invalidation based on data type
 */
export * from "./cache";

// ============================================================================
// LOW-LEVEL GOOGLE SHEETS CLIENT
// ============================================================================

/**
 * Direct Google Sheets API client with optimizations
 * - Raw Google Sheets API access with caching layer
 * - Batch operations for improved performance
 * - Connection pooling and retry logic
 */
export * from "./client";

// ============================================================================
// HIGH-LEVEL DATABASE ADAPTERS
// ============================================================================

/**
 * Prisma-like database adapters for Google Sheets
 * - OptimizedSheetsAdapter: General-purpose adapter for all models
 * - PlayerDayAdapter: Specialized adapter for partitioned PlayerDay data
 * - Provides familiar database operations (findMany, create, update, delete)
 */
export * from "./adapters";

// ============================================================================
// PLAYERDAY UTILITIES
// ============================================================================

/**
 * PlayerDay partitioning and validation
 * - Workbook partitioning by season ranges
 * - Update timeframe validation (2-day window)
 * - Batch operation categorization
 */
export * from "./playerday";

// ============================================================================
// MIGRATION TOOLS
// ============================================================================

/**
 * Schema migration and data transformation
 * - Handles data migration between different sheet structures
 * - Manages schema updates and data transformations
 */
export * from "./migration";

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Common usage patterns:
 *
 * // Basic queries
 * import { optimizedSheetsAdapter } from "~/lib/sheets";
 * const seasons = await optimizedSheetsAdapter.findMany("Season");
 * const team = await optimizedSheetsAdapter.findUnique("Team", { where: { id: 1 } });
 *
 * // Creating data
 * const newPlayer = await optimizedSheetsAdapter.create("Player", {
 *   data: { name: "Connor McDavid", position: "C" }
 * });
 *
 * // Batch operations
 * await optimizedSheetsAdapter.createMany("Player", {
 *   data: [player1, player2, player3]
 * });
 *
 * // Configuration access
 * import { WORKBOOKS, MODEL_TO_WORKBOOK } from "~/lib/sheets";
 * const generalWorkbookId = WORKBOOKS.GENERAL;
 * const teamWorkbook = MODEL_TO_WORKBOOK.Team;
 *
 * // Migration operations
 * import { migrationHelper } from "~/lib/sheets";
 * await migrationHelper.migrateSheet("Player", newSchema);
 */
