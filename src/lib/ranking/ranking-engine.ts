/**
 * Ranking Engine
 * ===============
 * Core ranking engine that scores player performances from 0-100 using
 * trained models and percentile-based normalization.
 */

import { PositionGroup } from "../types/enums";
import type {
  PlayerStatLine,
  ParsedStats,
  RankingModel,
  RankingResult,
  StatCategory,
  PositionWeights,
  SeasonDistribution,
} from "./types";
import { parseStats } from "./model-trainer";
import {
  percentileRank,
  sortAscending,
  clip,
  normalizeToScale,
} from "./stats-utils";

/**
 * Calculate composite score using position-specific weights
 * Uses raw stat values multiplied by weights for training consistency
 */
function calculateWeightedScore(
  stats: ParsedStats,
  weights: PositionWeights,
  posGroup: PositionGroup,
): number {
  let score = 0;

  // For goalies, invert GAA (lower is better)
  const gaaValue = posGroup === PositionGroup.G ? -stats.GAA : 0;

  score += stats.G * weights.G;
  score += stats.A * weights.A;
  score += stats.P * weights.P;
  score += stats.PM * weights.PM; // Plus/Minus (seasons 1-6)
  score += stats.PPP * weights.PPP;
  score += stats.SOG * weights.SOG;
  score += stats.HIT * weights.HIT;
  score += stats.BLK * weights.BLK;
  score += stats.W * weights.W;
  score += gaaValue * weights.GAA;
  score += stats.SVP * weights.SVP;

  return score;
}

/**
 * Estimate percentile from distribution using interpolation between known percentiles
 */
function estimatePercentileFromDistribution(
  value: number,
  distribution: SeasonDistribution,
): number {
  const { min, max, percentiles } = distribution;

  // Handle edge cases
  if (value <= min) return 0;
  if (value >= max) return 100;

  // Build lookup table from percentile values
  const lookup: Array<[number, number]> = [
    [0, min],
    [10, percentiles.p10],
    [25, percentiles.p25],
    [50, percentiles.p50],
    [75, percentiles.p75],
    [90, percentiles.p90],
    [95, percentiles.p95],
    [99, percentiles.p99],
    [100, max],
  ];

  // Find which two percentiles the value falls between
  for (let i = 0; i < lookup.length - 1; i++) {
    const [pct1, val1] = lookup[i]!;
    const [pct2, val2] = lookup[i + 1]!;

    if (value >= val1 && value <= val2) {
      // Linear interpolation
      const ratio = (value - val1) / (val2 - val1);
      return pct1 + ratio * (pct2 - pct1);
    }
  }

  return 50; // Fallback
}

/**
 * Get relevant stat categories for a position
 * Includes PM (Plus/Minus) for seasons 1-6
 */
function getRelevantStats(
  posGroup: PositionGroup,
  seasonId?: string,
): StatCategory[] {
  // Check if this is a season that used PM (seasons 1-6)
  const usesPM =
    seasonId &&
    (seasonId === "1" ||
      seasonId === "2" ||
      seasonId === "3" ||
      seasonId === "4" ||
      seasonId === "5" ||
      seasonId === "6");

  switch (posGroup) {
    case PositionGroup.F:
    case PositionGroup.D:
      return usesPM
        ? ["G", "A", "P", "PM", "PPP", "SOG", "HIT", "BLK"]
        : ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];
    case PositionGroup.G:
      return ["W", "GAA", "SVP"];
    default:
      return [];
  }
}

/**
 * Rank a single player performance
 */
export function rankPerformance(
  statLine: PlayerStatLine,
  model: RankingModel,
): RankingResult {
  const { seasonId, posGroup } = statLine;

  // Handle missing or empty seasonId - skip warning for cleaner output
  if (!seasonId || seasonId.trim() === "") {
    return rankWithGlobalWeights(statLine, model);
  }

  const modelKey = `${seasonId}:${posGroup}`;

  // Get season-specific model or fall back to global weights
  const seasonModel = model.models[modelKey];

  if (!seasonModel) {
    console.warn(
      `No model found for ${modelKey}, using global weights for ${posGroup}`,
    );
    return rankWithGlobalWeights(statLine, model);
  }

  // Parse stats
  const parsed = parseStats(statLine);

  // Check if this is a zero-stat performance (player didn't play)
  // All counting stats should be 0 for a DNP (Did Not Play)
  const isZeroPerformance =
    posGroup === PositionGroup.G
      ? parsed.W === 0 && parsed.GAA === 0 && parsed.SVP === 0
      : parsed.G === 0 &&
        parsed.A === 0 &&
        parsed.P === 0 &&
        parsed.SOG === 0 &&
        parsed.HIT === 0 &&
        parsed.BLK === 0;

  // Return null/undefined score for zero-stat performances (DNP)
  // This will show as empty in the sheet
  if (isZeroPerformance) {
    const relevantStats = getRelevantStats(posGroup, statLine.seasonId);
    return {
      score: NaN, // NaN will be treated as empty in Google Sheets
      percentile: 0,
      breakdown: relevantStats.map((stat) => ({
        category: stat,
        value: parsed[stat],
        percentile: 0,
        weight: seasonModel.weights[stat] || 1,
        contribution: 0,
      })),
      seasonId: statLine.seasonId,
      posGroup,
      isOutlier: false,
    };
  }

  // Calculate percentile-based composite score to spread out top performers
  // This approach transforms each stat to its percentile, applies exponential scaling,
  // then weights and combines them - avoiding clustering at the top end
  let weightedSum = 0;
  let totalWeight = 0;

  const statsToRank = getRelevantStats(posGroup, statLine.seasonId);

  for (const stat of statsToRank) {
    const value =
      stat === "GAA" && posGroup === PositionGroup.G
        ? -parsed[stat] // Invert GAA for goalies
        : parsed[stat];

    const distribution = seasonModel.distributions[stat];
    if (!distribution) continue;

    // Get percentile rank (0-100) for this stat
    const percentile = estimatePercentileFromDistribution(value, distribution);

    // Apply exponential transformation to spread out the top end
    // This creates significant separation between 95th, 99th, and 99.9th percentiles
    // Using power of 1.8 creates aggressive spreading at the top
    const transformedPercentile = Math.pow(percentile / 100, 1.8) * 100;

    const weight = seasonModel.weights[stat] || 1;
    weightedSum += transformedPercentile * weight;
    totalWeight += weight;
  }

  // This is now our composite score - weighted average of transformed percentiles (0-100 scale)
  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // The composite score is already percentile-based (0-100), so normalize to 0-1
  const normalized = compositeScore / 100;

  // Apply position-specific curve to create appropriate spread
  // Goalies: Use 0.95 (nearly linear) for flatter, more even distribution across the range
  // This creates maximum spread and avoids clustering at extremes
  // Skaters: More parabolic (0.5 = sqrt) to compress the scale
  const curveStrength = posGroup === PositionGroup.G ? 0.95 : 0.5;
  const curved = Math.pow(normalized, curveStrength);

  // Apply position-specific scaling for desired range
  // Goalies: Scale higher (130 vs 117) due to gentler curve compression
  // Skaters: Scale to 0-117 for typical max performances with parabolic curve
  const scaleFactor = posGroup === PositionGroup.G ? 130 : 117;

  // Apply an additional goalie multiplier to reach target peak of ~100-105 for shutouts
  // 0.85 curve + 130 scale + 1.25 multiplier = balanced distribution with shutouts ~105-110
  const goalieMultiplier = posGroup === PositionGroup.G ? 1.25 : 1.0;

  let score = curved * scaleFactor * goalieMultiplier;

  // Only floor at 0, no ceiling - extreme outliers can exceed 117
  score = Math.max(0, score);

  // Calculate percentile for reference (the composite score is our percentile)
  const percentile = Math.min(100, compositeScore);

  // Check if outlier (composite above 99 or below 10 on the transformed percentile scale)
  const isOutlier = compositeScore > 99 || compositeScore < 10;

  // Calculate per-stat breakdown
  const relevantStats = getRelevantStats(posGroup, statLine.seasonId);
  const breakdown = relevantStats.map((category) => {
    const value = parsed[category];
    const distribution = seasonModel.distributions[category];

    // For GAA, invert the percentile calculation (lower is better)
    let statPercentile: number;
    if (category === "GAA" && posGroup === PositionGroup.G) {
      // Invert: lower GAA = higher percentile
      statPercentile = normalizeToScale(
        -value, // Negate the value
        -distribution.max, // Swap and negate min/max
        -distribution.min,
      );
    } else {
      statPercentile = normalizeToScale(
        value,
        distribution.min,
        distribution.max,
      );
    }

    const weight = seasonModel.weights[category];
    const contribution = (statPercentile * weight) / relevantStats.length;

    return {
      category,
      value,
      percentile: statPercentile,
      weight,
      contribution,
    };
  });

  // Score is based on z-score, percentile is for reference
  return {
    score,
    percentile,
    breakdown,
    seasonId,
    posGroup,
    isOutlier,
  };
}

/**
 * Rank using global weights when season-specific model unavailable
 */
function rankWithGlobalWeights(
  statLine: PlayerStatLine,
  model: RankingModel,
): RankingResult {
  const { seasonId, posGroup } = statLine;
  const parsed = parseStats(statLine);
  const weights = model.globalWeights[posGroup];

  // Calculate composite score
  const compositeScore = calculateWeightedScore(parsed, weights, posGroup);

  // Estimate percentile using global distribution across all models
  const allModels = Object.values(model.models).filter(
    (m) => m.posGroup === posGroup,
  );

  if (allModels.length === 0) {
    // No data at all - return middle score
    return {
      score: 50,
      percentile: 50,
      breakdown: [],
      seasonId,
      posGroup,
      isOutlier: false,
    };
  }

  // Collect all composite scores from all seasons for this position
  const allCompositeScores = allModels.flatMap((m) => [
    m.compositeDistribution.min,
    m.compositeDistribution.percentiles.p25,
    m.compositeDistribution.percentiles.p50,
    m.compositeDistribution.percentiles.p75,
    m.compositeDistribution.max,
  ]);

  const sortedScores = sortAscending(allCompositeScores);
  const percentile = percentileRank(compositeScore, sortedScores);

  const relevantStats = getRelevantStats(posGroup, statLine.seasonId);
  const breakdown = relevantStats.map((category) => ({
    category,
    value: parsed[category],
    percentile: 50, // Unknown without season model
    weight: weights[category],
    contribution: 0,
  }));

  return {
    score: clip(percentile, 0, 100),
    percentile,
    breakdown,
    seasonId,
    posGroup,
    isOutlier: false,
  };
}

/**
 * Rank multiple performances in batch
 */
export function rankPerformances(
  statLines: PlayerStatLine[],
  model: RankingModel,
): RankingResult[] {
  return statLines.map((line) => rankPerformance(line, model));
}

/**
 * Get performance grade label based on score
 * Scores naturally scale from 0-90 for typical performances with parabolic curve compression
 * Only extreme outliers exceed 100
 */
export function getPerformanceGrade(score: number): string {
  if (score >= 100) return "Legendary"; // Extreme outliers beyond normal distribution
  if (score >= 85) return "Spectacular"; // Top 1-2%
  if (score >= 75) return "Elite"; // Top 5%
  if (score >= 65) return "Excellent"; // Top 10-15%
  if (score >= 55) return "Great"; // Top 25%
  if (score >= 45) return "Good"; // Above median
  if (score >= 35) return "Average"; // Near median
  if (score >= 25) return "Below Average"; // Below median
  if (score >= 15) return "Poor"; // Bottom 25%
  if (score >= 10) return "Very Poor"; // Bottom 10%
  return "Minimal"; // Bottom 5%
}

/**
 * Compare two performances
 */
export function comparePerformances(
  result1: RankingResult,
  result2: RankingResult,
): {
  scoreDifference: number;
  percentileDifference: number;
  betterPerformance: 1 | 2 | "tie";
} {
  const scoreDiff = result1.score - result2.score;

  return {
    scoreDifference: scoreDiff,
    percentileDifference: result1.percentile - result2.percentile,
    betterPerformance:
      Math.abs(scoreDiff) < 0.5 ? "tie" : scoreDiff > 0 ? 1 : 2,
  };
}
