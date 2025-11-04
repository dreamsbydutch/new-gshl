/**
 * Ranking Algorithm Types
 * =======================
 * Type definitions for the player performance ranking system.
 */

import type { PositionGroup } from "../types/enums";

/**
 * Statistical categories used in ranking calculations
 */
export type StatCategory =
  | "G"
  | "A"
  | "P"
  | "PM" // Plus/Minus (used in seasons 1-6)
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "GAA"
  | "SVP";

/**
 * Raw stat line from a player's daily performance
 */
export interface PlayerStatLine {
  posGroup: PositionGroup;
  seasonId: string;
  G: string;
  A: string;
  P: string;
  PM?: string; // Plus/Minus (optional - only in seasons 1-6)
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GAA: string;
  SVP: string;
}

/**
 * Parsed stat values as numbers for calculation
 */
export interface ParsedStats {
  G: number;
  A: number;
  P: number;
  PM: number; // Plus/Minus (used in seasons 1-6)
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GAA: number;
  SVP: number;
}

/**
 * Position-specific weights for each stat category
 * Values range from 0 to 1, representing relative importance
 */
export interface PositionWeights {
  G: number;
  A: number;
  P: number;
  PM: number; // Plus/Minus (used in seasons 1-6)
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GAA: number;
  SVP: number;
}

/**
 * Statistical distribution parameters for a season
 */
export interface SeasonDistribution {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/**
 * Trained model parameters for a specific position in a season
 */
export interface PositionSeasonModel {
  seasonId: string;
  posGroup: PositionGroup;
  sampleSize: number;
  weights: PositionWeights;
  distributions: Record<StatCategory, SeasonDistribution>;
  compositeDistribution: SeasonDistribution;
}

/**
 * Complete trained ranking model
 */
export interface RankingModel {
  version: string;
  trainedAt: Date;
  totalSamples: number;
  seasonRange: {
    earliest: string;
    latest: string;
  };
  models: Record<string, PositionSeasonModel>; // Key: `${seasonId}:${posGroup}`
  globalWeights: Record<PositionGroup, PositionWeights>;
}

/**
 * Result of ranking a single stat line
 */
export interface RankingResult {
  score: number; // 0-100
  percentile: number; // 0-100
  breakdown: {
    category: StatCategory;
    value: number;
    percentile: number;
    weight: number;
    contribution: number;
  }[];
  seasonId: string;
  posGroup: PositionGroup;
  isOutlier: boolean;
}

/**
 * Training configuration options
 */
export interface TrainingConfig {
  minSampleSize: number;
  outlierThreshold: number; // z-score threshold
  smoothingFactor: number; // For cross-season normalization
  useAdaptiveWeights: boolean;
}

/**
 * Performance metrics for model validation
 */
export interface ModelMetrics {
  seasonId: string;
  posGroup: PositionGroup;
  sampleSize: number;
  coverage: number; // Percentage of data used
  correlations: Record<StatCategory, number>;
  weightStability: number;
}
