/**
 * Player Performance Ranking Algorithm
 * =====================================
 *
 * A sophisticated, data-driven ranking system for player daily performances.
 *
 * ## Key Features
 *
 * 1. **Position-Aware Weighting**: Different stat categories are weighted based on
 *    position group (F, D, G) and their typical production patterns.
 *
 * 2. **Season-Relative Scoring**: Ranks are calculated relative to the specific
 *    season's distribution, making scores comparable across years despite changing
 *    overall production levels.
 *
 * 3. **Percentile-Based Ranking**: Scores from 0-100 represent percentile ranks
 *    within the season and position group.
 *
 * 4. **Statistical Rigor**: Uses variance analysis, outlier detection, and
 *    distribution modeling to ensure robust rankings.
 *
 * ## Usage
 *
 * ### Training a Model
 *
 * ```typescript
 * import { trainRankingModel } from "@gshl/lib/ranking";
 *
 * // Load all historical PlayerDay stat lines
 * const allStatLines = await fetchAllPlayerDayStatLines();
 *
 * // Train the model
 * const model = trainRankingModel(allStatLines, {
 *   minSampleSize: 50,
 *   outlierThreshold: 4,
 *   smoothingFactor: 0.3,
 * });
 *
 * // Save for later use
 * const modelJson = serializeModel(model);
 * await saveModelToStorage(modelJson);
 * ```
 *
 * ### Ranking Performances
 *
 * ```typescript
 * import { rankPerformance, getPerformanceGrade } from "@gshl/lib/ranking";
 *
 * // Load trained model
 * const modelJson = await loadModelFromStorage();
 * const model = deserializeModel(modelJson);
 *
 * // Rank a single performance
 * const result = rankPerformance(playerStatLine, model);
 *
 * console.log(`Score: ${result.score}/100`);
 * console.log(`Grade: ${getPerformanceGrade(result.score)}`);
 * console.log(`Percentile: ${result.percentile}th`);
 *
 * // View stat-by-stat breakdown
 * for (const stat of result.breakdown) {
 *   console.log(`${stat.category}: ${stat.value} (${stat.percentile}th percentile)`);
 * }
 * ```
 *
 * ### Batch Ranking
 *
 * ```typescript
 * import { rankPerformances } from "@gshl/lib/ranking";
 *
 * const results = rankPerformances(multipleStatLines, model);
 *
 * // Sort by score
 * const topPerformances = results
 *   .sort((a, b) => b.score - a.score)
 *   .slice(0, 10);
 * ```
 *
 * ## Algorithm Details
 *
 * ### Weight Calculation
 *
 * For each position group and season, weights are calculated based on:
 * - **Coefficient of Variation**: Stats with higher relative variance get higher weights
 * - **Position Relevance**: Goalies ignore skater stats; skaters ignore goalie stats
 * - **Normalization**: Weights sum to the number of relevant stats
 *
 * ### Scoring Process
 *
 * 1. Parse stat line values to numbers
 * 2. Apply position-specific weights to each stat category
 * 3. Calculate composite weighted score
 * 4. Normalize to percentile within season's distribution
 * 5. Clip to 0-100 range
 *
 * ### Season-Relative Normalization
 *
 * Each season has different overall production levels. The algorithm:
 * - Maintains separate distributions for each season
 * - Ranks within-season to get relative performance
 * - Uses percentiles to make scores comparable across seasons
 *
 * ### GAA Handling
 *
 * Goals Against Average is inverted (negated) before weighting since lower is better.
 *
 * ## Model Structure
 *
 * ```typescript
 * RankingModel {
 *   version: "1.0.0"
 *   trainedAt: Date
 *   totalSamples: number
 *   seasonRange: { earliest, latest }
 *
 *   models: {
 *     "season_12:F": PositionSeasonModel {
 *       weights: { G: 1.2, A: 1.1, ... }
 *       distributions: { G: {...}, A: {...}, ... }
 *       compositeDistribution: {...}
 *     }
 *     "season_12:D": ...
 *     "season_12:G": ...
 *   }
 *
 *   globalWeights: {
 *     F: PositionWeights
 *     D: PositionWeights
 *     G: PositionWeights
 *   }
 * }
 * ```
 *
 * ## Stat Categories
 *
 * ### Forwards (F) & Defense (D)
 * - G (Goals)
 * - A (Assists)
 * - P (Points)
 * - PPP (Power Play Points)
 * - SOG (Shots on Goal)
 * - HIT (Hits)
 * - BLK (Blocks)
 *
 * ### Goalies (G)
 * - W (Wins)
 * - GAA (Goals Against Average) - inverted
 * - SVP (Save Percentage)
 *
 * ## Performance Grades
 *
 * - 95-100: Elite
 * - 90-94: Excellent
 * - 80-89: Great
 * - 70-79: Good
 * - 60-69: Above Average
 * - 50-59: Average
 * - 40-49: Below Average
 * - 30-39: Poor
 * - 20-29: Very Poor
 * - 0-19: Minimal
 */

// Main API exports
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
} from "./weight-calculator";

export * from "./stats-utils";
export * from "./types";
