/**
 * Player Performance Ranking Toolkit
 * ==================================
 * Unified training + runtime engine used for generating and consuming
 * percentile-based performance scores across every aggregation level the
 * platform supports (daily, weekly, season, NHL reference sets, and team data).
 */

export {
  trainRankingModel,
  serializeModel,
  deserializeModel,
  parseStats,
} from "./model-trainer";

export {
  rankPerformance,
  rankPerformances,
  getPerformanceGrade,
  comparePerformances,
} from "./ranking-engine";

export {
  calculatePositionWeights,
  calculateGlobalWeights,
  applyPositionAdjustments,
  getRelevantStats,
} from "./weight-calculator";

export * from "./types";
export * from "./stats-utils";
