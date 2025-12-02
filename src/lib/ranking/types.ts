import type { PositionGroup, SeasonType } from "../types/enums";

export type AggregationLevel =
  | "playerDay"
  | "playerWeek"
  | "playerSplit"
  | "playerTotal"
  | "playerNhl"
  | "teamDay"
  | "teamWeek"
  | "teamSeason";

export type EntityType = "player" | "team";

export type StatCategory =
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "GA"
  | "GAA"
  | "SA"
  | "SV"
  | "SVP"
  | "SO"
  | "TOI";

export type ParsedStats = Record<StatCategory, number>;

export type PositionWeights = Record<StatCategory, number>;

export interface StatDistribution {
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

export type CompositeDistribution = StatDistribution;

export interface PositionSeasonModel {
  seasonId: string;
  posGroup: PositionGroup;
  aggregationLevel: AggregationLevel;
  seasonPhase: SeasonType;
  entityType: EntityType;
  sampleSize: number;
  weights: PositionWeights;
  distributions: Record<StatCategory, StatDistribution>;
  compositeDistribution: CompositeDistribution;
}

export interface TrainingConfig {
  minSampleSize: number;
  outlierThreshold: number;
  smoothingFactor: number;
  useAdaptiveWeights: boolean;
  scarcityWeights?: Record<string, number>;
  categoryImpactWeights?: Record<string, number>;
  weekTypeLookup?: Record<string, SeasonType>;
}

export interface RankingModel {
  version: string;
  trainedAt: Date;
  totalSamples: number;
  seasonRange: {
    earliest: string;
    latest: string;
  };
  models: Record<string, PositionSeasonModel>;
  globalWeights: Record<PositionGroup, PositionWeights>;
  aggregationBlendWeights?: Record<string, Record<string, unknown>>;
}

export interface RankingBreakdownEntry {
  category: StatCategory;
  value: number;
  percentile: number;
  weight: number;
}

export interface RankingResult {
  score: number;
  percentile: number;
  modelKey: string;
  seasonId: string;
  aggregationLevel: AggregationLevel;
  posGroup: PositionGroup;
  seasonPhase: SeasonType;
  breakdown: RankingBreakdownEntry[];
}

export type PlayerStatLine = Record<string, unknown> & {
  seasonId: string | number;
  posGroup?: string | null;
  seasonPhase?: string | null;
  seasonType?: string | null;
  playerId?: string | null;
  gshlTeamId?: string | null;
  weekId?: string | null;
  date?: string | Date | null;
  entityType?: EntityType;
};

export type TeamStatLine = Record<string, unknown> & {
  seasonId: string | number;
  gshlTeamId?: string | null;
  weekId?: string | null;
  date?: string | Date | null;
  seasonPhase?: string | null;
  seasonType?: string | null;
  entityType?: EntityType;
};

export type StatLine = PlayerStatLine | TeamStatLine;

export interface ModelClassification {
  seasonId: string;
  seasonPhase: SeasonType;
  aggregationLevel: AggregationLevel;
  posGroup: PositionGroup;
  entityType: EntityType;
}
