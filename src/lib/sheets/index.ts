/**
 * Google Sheets Integration Barrel Exports
 *
 * This module provides a centralized export point for all Google Sheets related functionality
 * used throughout the GSHL application for data storage and retrieval.
 *
 * Organized into logical subdirectories:
 * - config: Configuration, workbook mappings, and model metadata
 * - client: Low-level Google Sheets API client
 * - reader: Minimal read-optimized snapshot reader
 * - writer: Minimal targeted write helpers (used sparingly)
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
// (Adapter/migration utilities intentionally not exported; keep this integration lean.)

// ============================================================================
// FAST READ-ONLY READER
// ============================================================================

/**
 * Minimal, read-only batch reader designed for quick snapshots.
 * Prefer this for client-side caching (BrowserDB/localStorage) patterns.
 */
export * from "./reader/fast-reader";

// ============================================================================
// MINIMAL WRITER
// ============================================================================

/**
 * Targeted write helper (used for the few remaining update flows).
 */
export * from "./writer/minimal-writer";

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Common usage patterns:
 *
 * // Snapshot reads (preferred)
 * import { fastSheetsReader } from "~/lib/sheets";
 * const snapshot = await fastSheetsReader.fetchSnapshot(["Season", "Team", "Player"]);
 *
 * // Configuration access
 * import { WORKBOOKS, MODEL_TO_WORKBOOK } from "~/lib/sheets";
 * const generalWorkbookId = WORKBOOKS.GENERAL;
 * const teamWorkbook = MODEL_TO_WORKBOOK.Team;
 *
 */
