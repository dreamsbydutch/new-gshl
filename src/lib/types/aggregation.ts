/**
 * @fileoverview Aggregation Type Definitions
 *
 * This module contains all type definitions for the stat aggregation system,
 * including configuration types, input/output types, and orchestration types.
 *
 * @module types/aggregation
 */

import type {
  PlayerDayStatLine,
  PlayerWeekStatLine,
  TeamDayStatLine,
  TeamWeekStatLine,
  Week,
} from "./database";

/* ============================================================================
 * CONFIGURATION TYPES
 * ========================================================================= */

/**
 * Configuration for stat field aggregation behavior
 */
export interface StatFieldConfig {
  /** Field name in the stat line */
  field: string;
  /** How to aggregate: 'sum' | 'calculated' | 'metadata' */
  type: "sum" | "calculated" | "metadata";
  /** Only sum when GS="1" (for player aggregations) */
  requiresStarted?: boolean;
  /** Position group filter: 'G' | 'skater' | 'all' */
  positionFilter?: "G" | "skater" | "all";
}

/**
 * Aggregation configuration defines how to group and process records
 */
export interface AggregationConfig<TInput, TOutput> {
  /** Unique composite key builder (e.g., "playerId:weekId:gshlTeamId") */
  buildGroupKey: (
    record: TInput,
    metadata?: Map<string, { weekType?: string; [key: string]: unknown }>,
  ) => string;
  /** Parse group key back into components */
  parseGroupKey: (key: string) => Record<string, string>;
  /** Build the output record from aggregated data */
  buildOutputRecord: (
    keyParts: Record<string, string>,
    stats: Record<string, number>,
    metadata: Record<string, unknown>,
  ) => TOutput;
  /** Stat field configurations */
  statFields: StatFieldConfig[];
  /** Custom metadata extractors */
  metadataExtractors?: Record<string, (records: TInput[]) => unknown>;
}

/**
 * Summary metrics for aggregation reporting
 */
export interface AggregationSummary {
  input: {
    totalRecords: number;
    uniqueGroups: number;
    [key: string]: number;
  };
  output: {
    totalRecords: number;
    [key: string]: number | string;
  };
}

/* ============================================================================
 * STAT LINE INPUT TYPES
 * ========================================================================= */

/**
 * Player week stat line input (for aggregating player days → player weeks)
 */
export interface PlayerWeekStatLineInput {
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  nhlPos: string[];
  posGroup: string;
  nhlTeam: string;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G?: string;
  A?: string;
  P?: string;
  PM?: string;
  PIM?: string;
  PPP?: string;
  SOG?: string;
  HIT?: string;
  BLK?: string;
  W?: string;
  GA?: string;
  GAA?: string;
  SV?: string;
  SA?: string;
  SVP?: string;
  SO?: string;
  TOI?: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
}

/**
 * Player split stat line input (for aggregating player weeks → player splits by team + season type)
 */
export interface PlayerSplitStatLineInput {
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  nhlPos: string[];
  posGroup: string;
  nhlTeam: string;
  seasonType: string;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G?: string;
  A?: string;
  P?: string;
  PM?: string;
  PIM?: string;
  PPP?: string;
  SOG?: string;
  HIT?: string;
  BLK?: string;
  W?: string;
  GA?: string;
  GAA?: string;
  SV?: string;
  SA?: string;
  SVP?: string;
  SO?: string;
  TOI?: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
}

/**
 * Player total stat line input (for aggregating player weeks → player totals across all teams by season type)
 */
export interface PlayerTotalStatLineInput {
  seasonId: string;
  gshlTeamIds: string[];
  playerId: string;
  nhlPos: string[];
  posGroup: string;
  nhlTeam: string;
  seasonType: string;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G?: string;
  A?: string;
  P?: string;
  PM?: string;
  PIM?: string;
  PPP?: string;
  SOG?: string;
  HIT?: string;
  BLK?: string;
  W?: string;
  GA?: string;
  GAA?: string;
  SV?: string;
  SA?: string;
  SVP?: string;
  SO?: string;
  TOI?: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
}

/**
 * Team day stat line input (for aggregating player days → team days)
 */
export interface TeamDayStatLineInput {
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  date: Date;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
}

/**
 * Team week stat line input (for aggregating team days → team weeks)
 */
export interface TeamWeekStatLineInput {
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  days: number;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
}

/**
 * Team season stat line input (for aggregating team weeks → team seasons by season type)
 */
export interface TeamSeasonStatLineInput {
  seasonId: string;
  seasonType: string;
  gshlTeamId: string;
  days: number;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
}

/* ============================================================================
 * ORCHESTRATION TYPES
 * ========================================================================= */

/**
 * Result summary from stat orchestration
 */
export interface StatOrchestrationResult {
  /** Date that was processed */
  date: Date;
  /** Week ID associated with the date */
  weekId: string;
  /** Season ID associated with the date */
  seasonId: string;
  /** Total records updated across all aggregations */
  totalRecordsUpdated: number;
  /** Breakdown by aggregation type */
  breakdown: {
    playerWeeks: { created: number; updated: number };
    playerSplits: { created: number; updated: number };
    playerTotals: { created: number; updated: number };
    teamDays: { created: number; updated: number };
    teamWeeks: { created: number; updated: number };
    teamSeasons: { created: number; updated: number };
  };
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Any errors encountered (non-fatal) */
  errors: string[];
}

/**
 * Dependencies injected for database operations
 * This allows the orchestrator to work with any data source (Sheets, SQL, etc.)
 */
export interface StatOrchestrationDeps {
  /** Fetch player days for a specific date */
  fetchPlayerDaysByDate: (date: Date) => Promise<PlayerDayStatLine[]>;
  /** Fetch player weeks for a specific week */
  fetchPlayerWeeksByWeek: (weekId: string) => Promise<PlayerWeekStatLine[]>;
  /** Fetch team days for a specific week */
  fetchTeamDaysByWeek: (weekId: string) => Promise<TeamDayStatLine[]>;
  /** Fetch team weeks for a specific season */
  fetchTeamWeeksBySeason: (seasonId: string) => Promise<TeamWeekStatLine[]>;
  /** Fetch week metadata by date */
  fetchWeekByDate: (date: Date) => Promise<Week | null>;
  /** Fetch all weeks for a season */
  fetchWeeksBySeason: (seasonId: string) => Promise<Week[]>;
  /** Upsert player week records */
  upsertPlayerWeeks: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
  /** Upsert player split records */
  upsertPlayerSplits: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
  /** Upsert player total records */
  upsertPlayerTotals: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
  /** Upsert team day records */
  upsertTeamDays: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
  /** Upsert team week records */
  upsertTeamWeeks: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
  /** Upsert team season records */
  upsertTeamSeasons: (
    records: Record<string, string>[],
  ) => Promise<{ created: number; updated: number }>;
}
