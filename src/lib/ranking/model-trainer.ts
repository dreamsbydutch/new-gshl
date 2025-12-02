import { PositionGroup } from "../types/enums";
import type {
  PlayerStatLine,
  TeamStatLine,
  ParsedStats,
  RankingModel,
  PositionSeasonModel,
  TrainingConfig,
  PositionWeights,
  StatCategory,
  StatLine,
} from "./types";
import {
  calculateDistribution,
  mean,
  isOutlier,
  safeNumber,
  standardDeviation,
} from "./stats-utils";
import {
  ALL_STATS,
  calculatePositionWeights,
  calculateGlobalWeights,
  applyPositionAdjustments,
} from "./weight-calculator";
import { buildModelKey, classifyStatLine } from "./classification";

const DEFAULT_CONFIG: TrainingConfig = {
  minSampleSize: 50,
  outlierThreshold: 4,
  smoothingFactor: 0.3,
  useAdaptiveWeights: false,
};

type ClassifiedGroup = {
  stats: ParsedStats[];
  meta: NonNullable<ReturnType<typeof classifyStatLine>>;
};

function extractStats(line: StatLine): ParsedStats {
  const stats: ParsedStats = {
    G: safeNumber(line.G),
    A: safeNumber(line.A),
    P: safeNumber(line.P),
    PM: safeNumber(line.PM),
    PPP: safeNumber(line.PPP),
    SOG: safeNumber(line.SOG),
    HIT: safeNumber(line.HIT),
    BLK: safeNumber(line.BLK),
    W: safeNumber(line.W),
    GA: safeNumber(line.GA),
    GAA: safeNumber(line.GAA),
    SA: safeNumber(line.SA),
    SV: safeNumber(line.SV),
    SVP: safeNumber(line.SVP),
    SO: safeNumber(line.SO),
    TOI: safeNumber(line.TOI),
  };

  // Derived fallbacks to keep historical data compatible
  if (!stats.P && (stats.G || stats.A)) {
    stats.P = stats.G + stats.A;
  }

  return stats;
}

function calculateCompositeScore(
  stats: ParsedStats,
  weights: PositionWeights,
  posGroup: PositionGroup,
): number {
  let total = 0;
  for (const stat of ALL_STATS) {
    const weight = weights[stat] ?? 0;
    if (!weight) continue;
    const value = stats[stat] ?? 0;
    const signedValue = stat === "GA" || stat === "GAA" ? -value : value;
    total += signedValue * weight;
  }

  // Goalies benefit from workload; ensure TOI contributes positively
  if (posGroup === PositionGroup.G && weights.TOI) {
    total += (stats.TOI ?? 0) * weights.TOI;
  }

  return total;
}

function buildDistributions(
  samples: ParsedStats[],
  relevantStats: StatCategory[],
): Record<StatCategory, ReturnType<typeof calculateDistribution>> {
  const distributions: Record<
    StatCategory,
    ReturnType<typeof calculateDistribution>
  > = {} as Record<StatCategory, ReturnType<typeof calculateDistribution>>;

  for (const stat of relevantStats) {
    const values = samples.map((sample) => sample[stat] ?? 0);
    distributions[stat] = calculateDistribution(values);
  }

  return distributions;
}

function summarizeSeasonRange(modelKeys: string[]): {
  earliest: string;
  latest: string;
} {
  if (!modelKeys.length) return { earliest: "", latest: "" };
  const seasons = modelKeys
    .map((key) => key.split(":")[1])
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
  return {
    earliest: seasons[0] ?? "",
    latest: seasons[seasons.length - 1] ?? "",
  };
}

export function parseStats(
  statLine: PlayerStatLine | TeamStatLine,
): ParsedStats {
  return extractStats(statLine);
}

export function trainRankingModel(
  statLines: Array<PlayerStatLine | TeamStatLine>,
  config: Partial<TrainingConfig> = {},
): RankingModel {
  const finalConfig: TrainingConfig = { ...DEFAULT_CONFIG, ...config };
  const groupMap = new Map<string, ClassifiedGroup>();

  for (const line of statLines) {
    const classification = classifyStatLine(line, finalConfig.weekTypeLookup);
    if (!classification) continue;

    const key = buildModelKey(classification);
    if (!groupMap.has(key)) {
      groupMap.set(key, { stats: [], meta: classification });
    }
    groupMap.get(key)!.stats.push(extractStats(line));
  }

  const models: Record<string, PositionSeasonModel> = {};
  const weightsByPosition: Record<PositionGroup, PositionWeights[]> = {
    [PositionGroup.F]: [],
    [PositionGroup.D]: [],
    [PositionGroup.G]: [],
    [PositionGroup.TEAM]: [],
  };

  let processedSamples = 0;

  for (const [key, payload] of groupMap.entries()) {
    const { stats, meta } = payload;
    if (stats.length < finalConfig.minSampleSize) continue;

    const weights = calculatePositionWeights(stats, meta.posGroup, {
      scarcityWeights: finalConfig.scarcityWeights,
      categoryImpactWeights: finalConfig.categoryImpactWeights,
    });

    const distributions = buildDistributions(stats, ALL_STATS);

    const compositeScores = stats.map((sample) =>
      calculateCompositeScore(sample, weights, meta.posGroup),
    );

    const compositeMean = mean(compositeScores);
    const compositeStdDev = standardDeviation(compositeScores);
    const filteredScores = compositeScores.filter(
      (score) =>
        !isOutlier(
          score,
          compositeMean,
          compositeStdDev,
          finalConfig.outlierThreshold,
        ),
    );

    const compositeDistribution = calculateDistribution(
      filteredScores.length ? filteredScores : compositeScores,
    );

    models[key] = {
      seasonId: meta.seasonId,
      posGroup: meta.posGroup,
      aggregationLevel: meta.aggregationLevel,
      seasonPhase: meta.seasonPhase,
      entityType: meta.entityType,
      sampleSize: stats.length,
      weights: applyPositionAdjustments(weights, meta.posGroup),
      distributions,
      compositeDistribution,
    };

    weightsByPosition[meta.posGroup].push(weights);
    processedSamples += stats.length;
  }

  const globalWeights: Record<PositionGroup, PositionWeights> = {
    [PositionGroup.F]: calculateGlobalWeights(
      weightsByPosition[PositionGroup.F],
    ),
    [PositionGroup.D]: calculateGlobalWeights(
      weightsByPosition[PositionGroup.D],
    ),
    [PositionGroup.G]: calculateGlobalWeights(
      weightsByPosition[PositionGroup.G],
    ),
    [PositionGroup.TEAM]: calculateGlobalWeights(
      weightsByPosition[PositionGroup.TEAM],
    ),
  };

  const seasonRange = summarizeSeasonRange(Object.keys(models));

  return {
    version: "2.0.0",
    trainedAt: new Date(),
    totalSamples: processedSamples,
    seasonRange,
    models,
    globalWeights,
  };
}

export function serializeModel(model: RankingModel): string {
  return JSON.stringify(
    model,
    (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value as unknown;
    },
    2,
  );
}

export function deserializeModel(json: string): RankingModel {
  const data = JSON.parse(json) as RankingModel & { trainedAt?: string };
  return {
    ...data,
    trainedAt: data.trainedAt ? new Date(data.trainedAt) : new Date(),
  };
}
