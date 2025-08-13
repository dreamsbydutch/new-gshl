/**
 * Google Sheets Integration Barrel Exports
 *
 * This module provides a centralized export point for all Google Sheets related functionality
 * used throughout the GSHL application for data storage and retrieval.
 */

// ============================================================================
// CONFIGURATION & SETUP
// ============================================================================

/**
 * Google Sheets configuration constants and utilities
 * - WORKBOOKS: Maps workbook names to their Google Sheets IDs
 * - MODEL_TO_WORKBOOK: Routes database models to appropriate workbooks
 * - SHEETS_CONFIG: Defines sheet names and column mappings for each model
 * - convertModelToRow/convertRowToModel: Transform data between database and sheets formats
 */
export {
  WORKBOOKS,
  MODEL_TO_WORKBOOK,
  SHEETS_CONFIG,
  type DatabaseRecord,
  convertModelToRow,
  convertRowToModel,
} from "./config";

// ============================================================================
// DATABASE MIGRATION & SCHEMA MANAGEMENT
// ============================================================================

/**
 * Migration helper for managing Google Sheets schema changes
 * - Handles data migration between different sheet structures
 * - Manages schema updates and data transformations
 * - Provides rollback capabilities for failed migrations
 */
export { migrationHelper } from "./migration-helper";

// ============================================================================
// LOW-LEVEL GOOGLE SHEETS CLIENT
// ============================================================================

/**
 * Direct Google Sheets API client with optimizations
 * - Raw Google Sheets API access with caching layer
 * - Batch operations for improved performance
 * - Connection pooling and retry logic
 * - Rate limiting and error handling
 */
export {
  OptimizedSheetsClient,
  optimizedSheetsClient,
} from "./optimized-client";

// ============================================================================
// HIGH-LEVEL DATABASE ADAPTER
// ============================================================================

/**
 * Prisma-like database adapter for Google Sheets
 * - Provides familiar database operations (findMany, create, update, delete)
 * - Handles complex queries with where clauses and ordering
 * - Manages relationships between different models
 * - Includes caching, validation, and error handling
 * - Supports transactions and batch operations
 */
export {
  // Main adapter class and singleton instance
  OptimizedSheetsAdapter,
  optimizedSheetsAdapter,

  // TypeScript interfaces for type safety
  type FindManyOptions,
  type FindUniqueOptions,
  type CreateOptions,
  type CreateManyOptions,
  type UpdateOptions,
  type UpdateManyOptions,
  type DeleteOptions,
  type DeleteManyOptions,
  type UpsertOptions,
} from "./optimized-adapter";

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
