/**
 * Position Weight Calculator
 * ===========================
 * Derives optimal statistical weights for each position group based on
 * historical data and position-specific scoring patterns.
 */

import { PositionGroup } from "../types/enums";
import type { PositionWeights, StatCategory, ParsedStats } from "./types";
import { mean, standardDeviation, correlation } from "./stats-utils";

/**
 * Default base weights - all stats are equal for scoring (1 point each)
 * but positions have different typical production levels
 */
const BASE_WEIGHTS: PositionWeights = {
  G: 1.0,
  A: 1.0,
  P: 1.0,
  PM: 1.0, // Plus/Minus (seasons 1-6)
  PPP: 1.0,
  SOG: 1.0,
  HIT: 1.0,
  BLK: 1.0,
  W: 1.0,
  GAA: 1.0, // Note: Will be inverted for ranking (lower is better)
  SVP: 1.0,
};

/**
 * Stat categories relevant for each position group
 */
const POSITION_RELEVANT_STATS: Record<PositionGroup, StatCategory[]> = {
  [PositionGroup.F]: ["G", "A", "P", "PM", "PPP", "SOG", "HIT", "BLK"],
  [PositionGroup.D]: ["G", "A", "P", "PM", "PPP", "SOG", "HIT", "BLK"],
  [PositionGroup.G]: ["W", "GAA", "SVP"],
};

/**
 * Calculate position-specific weights based on data variance and frequency
 * Higher variance and higher mean production = higher weight for that position
 */
export function calculatePositionWeights(
  statLines: ParsedStats[],
  posGroup: PositionGroup,
): PositionWeights {
  const relevantStats = POSITION_RELEVANT_STATS[posGroup];
  const weights = { ...BASE_WEIGHTS };

  if (statLines.length === 0) return weights;

  // For each relevant stat, calculate variance-based weight
  for (const stat of relevantStats) {
    const values = statLines.map((line) => line[stat]);
    const stdDev = standardDeviation(values);
    const avg = mean(values);

    // Weight is based on coefficient of variation (normalized variance)
    // Stats with higher relative variance are more discriminating
    if (avg > 0) {
      const coefficientOfVariation = stdDev / avg;
      weights[stat] = Math.max(0.1, Math.min(2.0, coefficientOfVariation));
    } else {
      weights[stat] = 0.1; // Minimal weight for stats that are rarely recorded
    }
  }

  // Zero out irrelevant stats for this position
  const allStats: StatCategory[] = [
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];
  for (const stat of allStats) {
    if (!relevantStats.includes(stat)) {
      weights[stat] = 0;
    }
  }

  // Normalize weights so they sum to the number of relevant stats
  const totalWeight = relevantStats.reduce(
    (sum, stat) => sum + weights[stat],
    0,
  );
  if (totalWeight > 0) {
    const normalizationFactor = relevantStats.length / totalWeight;
    for (const stat of relevantStats) {
      weights[stat] *= normalizationFactor;
    }
  }

  return weights;
}

/**
 * Calculate adaptive weights that adjust based on actual correlations with wins
 * This would require game/matchup outcome data
 */
export function calculateAdaptiveWeights(
  statLines: ParsedStats[],
  posGroup: PositionGroup,
  outcomes?: number[], // Win contribution scores if available
): PositionWeights {
  const baseWeights = calculatePositionWeights(statLines, posGroup);

  // If no outcome data, return base weights
  if (!outcomes || outcomes.length !== statLines.length) {
    return baseWeights;
  }

  const relevantStats = POSITION_RELEVANT_STATS[posGroup];
  const adjustedWeights = { ...baseWeights };

  // Calculate correlation of each stat with outcomes
  for (const stat of relevantStats) {
    const values = statLines.map((line) => line[stat]);
    const corr = Math.abs(correlation(values, outcomes));

    // Boost weight based on correlation (0.5 to 1.5x multiplier)
    const multiplier = 0.5 + corr;
    adjustedWeights[stat] *= multiplier;
  }

  // Re-normalize
  const totalWeight = relevantStats.reduce(
    (sum, stat) => sum + adjustedWeights[stat],
    0,
  );
  if (totalWeight > 0) {
    const normalizationFactor = relevantStats.length / totalWeight;
    for (const stat of relevantStats) {
      adjustedWeights[stat] *= normalizationFactor;
    }
  }

  return adjustedWeights;
}

/**
 * Get global weights across all seasons for a position
 * Averages weights from multiple season-specific models
 */
export function calculateGlobalWeights(
  seasonWeights: PositionWeights[],
): PositionWeights {
  if (seasonWeights.length === 0) return BASE_WEIGHTS;

  const global = { ...BASE_WEIGHTS };
  const stats: StatCategory[] = [
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];

  for (const stat of stats) {
    const weights = seasonWeights.map((w) => w[stat]);
    global[stat] = mean(weights);
  }

  return global;
}

/**
 * Position-specific adjustments for special cases
 */
export function applyPositionAdjustments(
  weights: PositionWeights,
  posGroup: PositionGroup,
): PositionWeights {
  const adjusted = { ...weights };

  switch (posGroup) {
    case PositionGroup.F:
      // Forwards: Emphasize goals and power play points slightly more
      adjusted.G *= 1.1;
      adjusted.PPP *= 1.05;
      break;

    case PositionGroup.D:
      // Defensemen: Emphasize blocks and hits slightly more
      adjusted.BLK *= 1.15;
      adjusted.HIT *= 1.1;
      break;

    case PositionGroup.G:
      // Goalies: Save percentage is most important, GAA secondary
      adjusted.SVP *= 1.2;
      adjusted.GAA *= 1.1;
      adjusted.W *= 0.9; // Wins less controllable by goalie
      break;
  }

  return adjusted;
}
