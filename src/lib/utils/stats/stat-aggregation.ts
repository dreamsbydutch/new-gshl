/**
 * @fileoverview Unified Stat Aggregation System
 *
 * This module provides a flexible, type-safe aggregation framework for transforming
 * stat lines across different time periods and organizational levels.
 *
 * **Aggregation Hierarchy:**
 * - Player: Days → Weeks → Splits/Totals (by seasonType)
 * - Team: Days → Weeks → Seasons (by seasonType)
 *
 * **Key Concepts:**
 * - **Additive Stats**: Sum directly across periods (G, A, P, GP, etc.)
 * - **Calculated Stats**: Derived from other stats (GAA, SVP, Rating)
 * - **Metadata**: Non-stat fields that combine uniquely (nhlTeam, nhlPos)
 * - **Grouping Keys**: Composite keys that define unique aggregation boundaries
 *
 * **Business Rules:**
 * - TOI: Only summed from started players (GS="1") for player aggregations
 * - GAA: (GA/TOI)*60, rounded to 4 decimal places
 * - SVP: SV/SA, rounded to 6 decimal places
 * - Rating: TBD (currently 0)
 * - SeasonType Splitting: RS, PO, LT create separate records
 *
 * @module stat-aggregation
 */

import type {
  StatFieldConfig,
  AggregationConfig,
  AggregationSummary,
} from "@gshl-types";
import { PositionGroup, SeasonType } from "@gshl-types";

// Re-export types for use by other modules
export type {
  StatFieldConfig,
  AggregationConfig,
  AggregationSummary,
} from "@gshl-types";

/* ============================================================================
 * UTILITY FUNCTIONS
 * ========================================================================= */

/**
 * Parses a string stat value to a number, defaulting to 0 for empty/invalid values
 */
function parseStatValue(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Checks if a player was started (GS = "1" or "1.0")
 */
function wasStarted(gs: string | number | undefined | null): boolean {
  return gs === "1" || gs === "1.0" || gs === 1;
}

/**
 * Maps week type to season type enum
 * Regular season: RS, CC, NC
 * Playoffs: PO, QF, SF, F
 * Losers tournament: LT
 */
function getSeasonType(weekType: string): SeasonType {
  const type = weekType.toUpperCase();

  if (["RS", "CC", "NC"].includes(type)) {
    return SeasonType.REGULAR_SEASON;
  }

  if (["PO", "QF", "SF", "F"].includes(type)) {
    return SeasonType.PLAYOFFS;
  }

  if (type === "LT") {
    return SeasonType.LOSERS_TOURNAMENT;
  }

  return SeasonType.REGULAR_SEASON;
}

/**
 * Extracts unique string values from a field that may be string, array, or comma-separated
 */
function extractUniqueStrings(
  value: string | string[] | undefined | null,
): Set<string> {
  const unique = new Set<string>();

  if (!value) return unique;

  if (Array.isArray(value)) {
    value.forEach((v) => {
      const str = String(v).trim();
      if (str) unique.add(str);
    });
  } else {
    const str = String(value);
    // Handle comma-separated values
    str.split(",").forEach((part) => {
      const trimmed = part.trim();
      if (trimmed) unique.add(trimmed);
    });
  }

  return unique;
}

/**
 * Calculates GAA (Goals Against Average) = (GA / TOI) * 60
 * Rounded to 4 decimal places
 */
function calculateGAA(ga: number, toi: number): number {
  return toi > 0 ? parseFloat(((ga / toi) * 60).toFixed(4)) : 0;
}

/**
 * Calculates SVP (Save Percentage) = SV / SA
 * Rounded to 6 decimal places
 */
function calculateSVP(sv: number, sa: number): number {
  return sa > 0 ? parseFloat((sv / sa).toFixed(6)) : 0;
}

/* ============================================================================
 * CORE AGGREGATION ENGINE
 * ========================================================================= */

/**
 * Generic aggregation function that groups records and sums stats
 *
 * @template TInput - Input record type (e.g., PlayerDayStatLine)
 * @template TOutput - Output record type (e.g., PlayerWeekStatLineInput)
 *
 * @param records - Array of input records to aggregate
 * @param config - Aggregation configuration defining grouping and processing
 * @param metadata - Optional metadata map (e.g., weekId → Week for seasonType lookup)
 * @returns Array of aggregated output records
 *
 * @example
 * ```ts
 * const playerWeeks = aggregate(playerDays, playerDayToWeekConfig);
 * const teamSeasons = aggregate(teamWeeks, teamWeekToSeasonConfig, weekMetadata);
 * ```
 */
export function aggregate<TInput extends Record<string, unknown>, TOutput>(
  records: TInput[],
  config: AggregationConfig<TInput, TOutput>,
  metadata?: Map<string, { weekType?: string; [key: string]: unknown }>,
): TOutput[] {
  // Step 1: Build unique group keys
  const groups = new Map<string, TInput[]>();

  for (const record of records) {
    const key = config.buildGroupKey(record, metadata);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  // Step 2: Aggregate each group
  const results: TOutput[] = [];

  for (const [groupKey, groupRecords] of groups.entries()) {
    if (groupRecords.length === 0) continue;

    const keyParts = config.parseGroupKey(groupKey);
    const stats: Record<string, number> = {};
    const metadataValues: Record<string, unknown> = {};

    // Initialize stat accumulators
    for (const fieldConfig of config.statFields) {
      if (fieldConfig.type === "sum") {
        stats[fieldConfig.field] = 0;
      }
    }

    // Process each record in the group
    for (const record of groupRecords) {
      const isStarted = wasStarted(
        record.GS as string | number | null | undefined,
      );

      for (const fieldConfig of config.statFields) {
        if (fieldConfig.type === "sum") {
          // Check if we should skip due to started requirement
          if (fieldConfig.requiresStarted && !isStarted) {
            continue;
          }

          // Check position filter
          if (fieldConfig.positionFilter) {
            const posGroup = (record.posGroup ?? "") as PositionGroup | "";
            const isGoalie = posGroup === PositionGroup.G;

            if (fieldConfig.positionFilter === "G" && !isGoalie) continue;
            if (fieldConfig.positionFilter === "skater" && isGoalie) continue;
          }

          // Sum the stat
          const currentValue = stats[fieldConfig.field] ?? 0;
          stats[fieldConfig.field] =
            currentValue +
            parseStatValue(
              record[fieldConfig.field] as string | number | null | undefined,
            );
        }
      }
    }

    // Extract custom metadata
    if (config.metadataExtractors) {
      for (const [key, extractor] of Object.entries(
        config.metadataExtractors,
      )) {
        metadataValues[key] = extractor(groupRecords);
      }
    }

    // Calculate derived stats
    if (stats.GA !== undefined && stats.TOI !== undefined) {
      stats.GAA = calculateGAA(stats.GA, stats.TOI);
    }
    if (stats.SV !== undefined && stats.SA !== undefined) {
      stats.SVP = calculateSVP(stats.SV, stats.SA);
    }
    stats.Rating = 0; // TBD

    // Build output record
    const outputRecord = config.buildOutputRecord(
      keyParts,
      stats,
      metadataValues,
    );
    results.push(outputRecord);
  }

  return results;
}

/* ============================================================================
 * CONVERSION UTILITIES
 * ========================================================================= */

/**
 * Converts numeric stat values to strings for Google Sheets insertion
 *
 * @param records - Array of records with numeric stat values
 * @returns Array of records with all values converted to strings
 */
export function convertToSheets<T extends Record<string, unknown>>(
  records: T[],
): Record<string, string>[] {
  return records.map((record) => {
    const converted: Record<string, string> = {};

    for (const [key, value] of Object.entries(record)) {
      if (value instanceof Date) {
        // For date fields, only include yyyy-mm-dd (no time portion)
        converted[key] = value.toISOString().split("T")[0]!;
      } else if (Array.isArray(value)) {
        converted[key] = value.join(",");
      } else if (value === null || value === undefined) {
        converted[key] = "";
      } else if (typeof value === "object") {
        // For enum values, they have a string representation
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        converted[key] = String(value);
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        // Primitives can be safely converted
        converted[key] = String(value);
      } else {
        // Fallback for any other type
        converted[key] = "";
      }
    }

    return converted;
  });
}

/* ============================================================================
 * SUMMARY GENERATION
 * ========================================================================= */

/**
 * Generates aggregation summary with input/output metrics
 *
 * @param inputRecords - Original input records
 * @param outputRecords - Aggregated output records
 * @param groupingFields - Fields used for grouping (e.g., ['playerId', 'weekId'])
 * @returns Summary object with counts and metrics
 */
export function generateSummary<TInput, TOutput>(
  inputRecords: TInput[],
  outputRecords: TOutput[],
  groupingFields: Array<keyof TInput>,
): AggregationSummary {
  const summary: AggregationSummary = {
    input: {
      totalRecords: inputRecords.length,
      uniqueGroups: outputRecords.length,
    },
    output: {
      totalRecords: outputRecords.length,
    },
  };

  // Calculate unique counts for grouping fields
  for (const field of groupingFields) {
    const uniqueValues = new Set(inputRecords.map((r) => r[field]));
    summary.input[`unique${String(field)}`] = uniqueValues.size;
  }

  // Average records per group
  if (outputRecords.length > 0) {
    summary.output.averageInputPerOutput = (
      inputRecords.length / outputRecords.length
    ).toFixed(2);
  }

  return summary;
}

/* ============================================================================
 * CONFIGURATION BUILDERS
 * ========================================================================= */

/**
 * Common stat field definitions used across aggregations
 */
const COMMON_STAT_FIELDS: StatFieldConfig[] = [
  // Roster management stats (always sum, no GS requirement)
  { field: "GP", type: "sum" },
  { field: "MG", type: "sum" },
  { field: "IR", type: "sum" },
  { field: "IRplus", type: "sum" },
  { field: "GS", type: "sum" },
  { field: "ADD", type: "sum" },
  { field: "MS", type: "sum" },
  { field: "BS", type: "sum" },

  // Skater stats (require started for player aggregations)
  { field: "G", type: "sum", positionFilter: "skater" },
  { field: "A", type: "sum", positionFilter: "skater" },
  { field: "P", type: "sum", positionFilter: "skater" },
  { field: "PM", type: "sum", positionFilter: "skater" },
  { field: "PIM", type: "sum", positionFilter: "skater" },
  { field: "PPP", type: "sum", positionFilter: "skater" },
  { field: "SOG", type: "sum", positionFilter: "skater" },
  { field: "HIT", type: "sum", positionFilter: "skater" },
  { field: "BLK", type: "sum", positionFilter: "skater" },

  // Goalie stats (require started for player aggregations)
  { field: "W", type: "sum", positionFilter: "G" },
  { field: "GA", type: "sum", positionFilter: "G" },
  { field: "SV", type: "sum", positionFilter: "G" },
  { field: "SA", type: "sum", positionFilter: "G" },
  { field: "SO", type: "sum", positionFilter: "G" },
  { field: "TOI", type: "sum", positionFilter: "G" },

  // Calculated stats
  { field: "GAA", type: "calculated" },
  { field: "SVP", type: "calculated" },
  { field: "Rating", type: "calculated" },
];

/**
 * Creates stat field configurations for player aggregations (with started requirement)
 */
export function createPlayerStatFields(): StatFieldConfig[] {
  return COMMON_STAT_FIELDS.map((field) => {
    // Add requiresStarted flag for game stats
    if (
      field.type === "sum" &&
      !["GP", "MG", "IR", "IRplus", "GS", "ADD", "MS", "BS"].includes(
        field.field,
      )
    ) {
      return { ...field, requiresStarted: true };
    }
    return field;
  });
}

/**
 * Creates stat field configurations for PlayerDay → TeamDay aggregation
 * Requires started (GS = 1) for game stats since we're filtering raw player data
 */
export function createTeamStatFields(): StatFieldConfig[] {
  return COMMON_STAT_FIELDS.map((field) => {
    // Add requiresStarted flag for game stats (same as player aggregation)
    // Team stats should only count players who started (GS = 1)
    if (
      field.type === "sum" &&
      !["GP", "MG", "IR", "IRplus", "GS", "ADD", "MS", "BS"].includes(
        field.field,
      )
    ) {
      return { ...field, requiresStarted: true };
    }
    return field;
  });
}

/**
 * Creates stat field configurations for TeamDay → TeamWeek aggregation
 * No requiresStarted needed since TeamDays are already filtered
 */
export function createTeamDayToWeekStatFields(): StatFieldConfig[] {
  return COMMON_STAT_FIELDS.map((field) => ({
    ...field,
    positionFilter: "all", // Teams aggregate all positions together
    // No requiresStarted - team days are already filtered for started players
  }));
}

/* ============================================================================
 * HELPER FUNCTIONS
 * ========================================================================= */

/**
 * Extracts unique dates from records for 'days' count
 */
export function extractUniqueDates(
  records: Array<{ date: Date | string }>,
): number {
  const uniqueDates = new Set<string>();

  for (const record of records) {
    const dateStr =
      record.date instanceof Date
        ? record.date.toISOString().split("T")[0]
        : String(record.date).split("T")[0];
    if (dateStr) uniqueDates.add(dateStr);
  }

  return uniqueDates.size;
}

/**
 * Extracts unique NHL positions from records
 */
export function extractUniquePositions(
  records: Array<{ nhlPos: string | string[] }>,
): string[] {
  const positions = new Set<string>();

  for (const record of records) {
    if (Array.isArray(record.nhlPos)) {
      record.nhlPos.forEach((pos) => positions.add(String(pos)));
    } else if (record.nhlPos) {
      positions.add(String(record.nhlPos));
    }
  }

  return Array.from(positions);
}

/**
 * Extracts unique NHL teams from records
 */
export function extractUniqueTeams(
  records: Array<{ nhlTeam: string | string[] }>,
): string {
  const teams = new Set<string>();

  for (const record of records) {
    const extracted = extractUniqueStrings(record.nhlTeam);
    extracted.forEach((team) => teams.add(team));
  }

  return Array.from(teams).join(",");
}

/**
 * Extracts unique GSHL team IDs from records
 */
export function extractUniqueGshlTeams(
  records: Array<{ gshlTeamId: string }>,
): string[] {
  const teams = new Set<string>();
  records.forEach((r) => teams.add(r.gshlTeamId));
  return Array.from(teams);
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  parseStatValue,
  wasStarted,
  getSeasonType,
  extractUniqueStrings,
  calculateGAA,
  calculateSVP,
};
