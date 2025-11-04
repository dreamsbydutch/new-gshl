/**
 * Ranking Model Trainer
 * ======================
 * Trains the ranking algorithm on historical PlayerDay data to create
 * season-specific and position-specific ranking models.
 */

import { PositionGroup } from "../types/enums";
import type {
  PlayerStatLine,
  ParsedStats,
  RankingModel,
  PositionSeasonModel,
  PositionWeights,
  TrainingConfig,
  StatCategory,
} from "./types";
import { calculateDistribution, mean, isOutlier } from "./stats-utils";
import {
  calculatePositionWeights,
  calculateGlobalWeights,
  applyPositionAdjustments,
} from "./weight-calculator";

/**
 * Default training configuration
 */
const DEFAULT_CONFIG: TrainingConfig = {
  minSampleSize: 50, // Minimum games per position per season
  outlierThreshold: 4, // Z-score threshold for outlier removal
  smoothingFactor: 0.3, // For cross-season normalization
  useAdaptiveWeights: false, // Set true if outcome data available
};

/**
 * Parse string stat values to numbers
 */
export function parseStats(statLine: PlayerStatLine): ParsedStats {
  const parseFloat = (val: string): number => {
    const parsed = Number.parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  return {
    G: parseFloat(statLine.G),
    A: parseFloat(statLine.A),
    P: parseFloat(statLine.P),
    PM: parseFloat(statLine.PM ?? "0"), // Plus/Minus (seasons 1-6 only)
    PPP: parseFloat(statLine.PPP),
    SOG: parseFloat(statLine.SOG),
    HIT: parseFloat(statLine.HIT),
    BLK: parseFloat(statLine.BLK),
    W: parseFloat(statLine.W),
    GAA: parseFloat(statLine.GAA),
    SVP: parseFloat(statLine.SVP),
  };
}

/**
 * Calculate composite score for a stat line using weights
 */
function calculateCompositeScore(
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
 * Train a model for a specific position and season
 */
function trainPositionSeasonModel(
  statLines: PlayerStatLine[],
  seasonId: string,
  posGroup: PositionGroup,
  config: TrainingConfig,
): PositionSeasonModel | null {
  // Filter to this position group
  const positionStats = statLines.filter((s) => s.posGroup === posGroup);

  if (positionStats.length < config.minSampleSize) {
    console.warn(
      `Insufficient data for ${posGroup} in ${seasonId}: ${positionStats.length} samples (min: ${config.minSampleSize})`,
    );
    return null;
  }

  // Parse all stat lines
  const parsed = positionStats.map(parseStats);

  // Calculate weights for this position
  let weights = calculatePositionWeights(parsed, posGroup);
  weights = applyPositionAdjustments(weights, posGroup);

  // Calculate distributions for each stat category
  const stats: StatCategory[] = [
    "G",
    "A",
    "P",
    "PM", // Plus/Minus (seasons 1-6)
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];

  type SeasonDistribution = {
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
  };

  const distributions: Record<StatCategory, SeasonDistribution> = {} as Record<
    StatCategory,
    SeasonDistribution
  >;

  for (const stat of stats) {
    const values = parsed.map((p) => p[stat]);
    distributions[stat] = calculateDistribution(values);
  }

  // Calculate composite scores
  const compositeScores = parsed.map((p) =>
    calculateCompositeScore(p, weights, posGroup),
  );

  // Remove outliers from composite distribution
  const compositeMean = mean(compositeScores);
  const compositeFiltered = compositeScores.filter(
    (score) =>
      !isOutlier(
        score,
        compositeMean,
        Math.sqrt(
          compositeScores.reduce(
            (sum, s) => sum + Math.pow(s - compositeMean, 2),
            0,
          ) / compositeScores.length,
        ),
        config.outlierThreshold,
      ),
  );

  const compositeDistribution = calculateDistribution(compositeFiltered);

  return {
    seasonId,
    posGroup,
    sampleSize: positionStats.length,
    weights,
    distributions,
    compositeDistribution,
  };
}

/**
 * Train the complete ranking model on all historical data
 */
export function trainRankingModel(
  allStatLines: PlayerStatLine[],
  config: Partial<TrainingConfig> = {},
): RankingModel {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log("🎓 Training ranking model...");
  console.log(`📊 Total stat lines: ${allStatLines.length}`);

  // Group by season
  const seasonGroups = new Map<string, PlayerStatLine[]>();
  for (const line of allStatLines) {
    if (!seasonGroups.has(line.seasonId)) {
      seasonGroups.set(line.seasonId, []);
    }
    seasonGroups.get(line.seasonId)!.push(line);
  }

  console.log(`📅 Seasons found: ${seasonGroups.size}`);

  const models: Record<string, PositionSeasonModel> = {};
  const globalWeightsByPosition: Record<PositionGroup, PositionWeights[]> = {
    [PositionGroup.F]: [],
    [PositionGroup.D]: [],
    [PositionGroup.G]: [],
  };

  // Train models for each season and position combination
  for (const [seasonId, seasonLines] of seasonGroups.entries()) {
    console.log(
      `\n📈 Training season ${seasonId} (${seasonLines.length} games)`,
    );

    for (const posGroup of [
      PositionGroup.F,
      PositionGroup.D,
      PositionGroup.G,
    ]) {
      const model = trainPositionSeasonModel(
        seasonLines,
        seasonId,
        posGroup,
        finalConfig,
      );

      if (model) {
        const key = `${seasonId}:${posGroup}`;
        models[key] = model;
        globalWeightsByPosition[posGroup].push(model.weights);
        console.log(
          `  ✓ ${posGroup}: ${model.sampleSize} samples, composite range [${model.compositeDistribution.min.toFixed(2)}, ${model.compositeDistribution.max.toFixed(2)}]`,
        );
      }
    }
  }

  // Calculate global weights for each position
  const globalWeights: Record<PositionGroup, PositionWeights> = {
    [PositionGroup.F]: calculateGlobalWeights(
      globalWeightsByPosition[PositionGroup.F],
    ),
    [PositionGroup.D]: calculateGlobalWeights(
      globalWeightsByPosition[PositionGroup.D],
    ),
    [PositionGroup.G]: calculateGlobalWeights(
      globalWeightsByPosition[PositionGroup.G],
    ),
  };

  // Find season range
  const seasonIds = Array.from(seasonGroups.keys()).sort();
  const earliest = seasonIds[0] ?? "unknown";
  const latest = seasonIds[seasonIds.length - 1] ?? "unknown";

  console.log("\n✅ Training complete!");
  console.log(`📦 Total models trained: ${Object.keys(models).length}`);

  return {
    version: "1.0.0",
    trainedAt: new Date(),
    totalSamples: allStatLines.length,
    seasonRange: {
      earliest,
      latest,
    },
    models,
    globalWeights,
  };
}

/**
 * Save model to JSON for persistence
 */
export function serializeModel(model: RankingModel): string {
  return JSON.stringify(
    model,
    (key, value) => {
      // Convert dates to ISO strings
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value as unknown;
    },
    2,
  );
}

/**
 * Load model from JSON
 */
export function deserializeModel(json: string): RankingModel {
  const parsed = JSON.parse(json) as {
    trainedAt?: string;
    version?: string;
    totalSamples?: number;
    seasonRange?: { earliest: string; latest: string };
    models?: Record<string, PositionSeasonModel>;
    globalWeights?: Record<PositionGroup, PositionWeights>;
  };

  // Convert ISO strings back to dates
  const trainedAt = parsed.trainedAt ? new Date(parsed.trainedAt) : new Date();

  return {
    version: parsed.version ?? "1.0",
    trainedAt,
    totalSamples: parsed.totalSamples ?? 0,
    seasonRange: parsed.seasonRange ?? { earliest: "", latest: "" },
    models: parsed.models ?? {},
    globalWeights:
      parsed.globalWeights ?? ({} as Record<PositionGroup, PositionWeights>),
  };
}
