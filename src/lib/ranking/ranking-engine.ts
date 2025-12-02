import { PositionGroup, SeasonType } from "../types/enums";
import type {
  PlayerStatLine,
  TeamStatLine,
  RankingModel,
  RankingResult,
  RankingBreakdownEntry,
  StatCategory,
  ParsedStats,
} from "./types";
import { classifyStatLine, buildModelKey } from "./classification";
import { ALL_STATS, getRelevantStats } from "./weight-calculator";
import { clip } from "./stats-utils";
import { parseStats } from "./model-trainer";

const GOALIE_PLAYER_DAY_BOOST = 4.05;

const SCORE_GRADES: Array<{ min: number; max: number; grade: string }> = [
  { min: 95, max: 1000, grade: "Elite" },
  { min: 90, max: 95, grade: "Excellent" },
  { min: 80, max: 90, grade: "Great" },
  { min: 70, max: 80, grade: "Good" },
  { min: 60, max: 70, grade: "Above Average" },
  { min: 50, max: 60, grade: "Average" },
  { min: 40, max: 50, grade: "Below Average" },
  { min: 30, max: 40, grade: "Poor" },
  { min: 20, max: 30, grade: "Very Poor" },
  { min: 0, max: 20, grade: "Minimal" },
];

function directionallyAdjustedValue(stat: StatCategory, value: number): number {
  if (stat === "GA" || stat === "GAA") {
    return -value;
  }
  return value;
}

function estimatePercentile(
  value: number,
  distribution?: {
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
  },
): number {
  if (!distribution) return 0;
  const { min, max, percentiles } = distribution;
  if (max === min) return 50;
  if (value <= min) return 0;
  if (value >= max) return 100;

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

  for (let i = 0; i < lookup.length - 1; i++) {
    const [pct1, val1] = lookup[i]!;
    const [pct2, val2] = lookup[i + 1]!;
    if (value >= val1 && value <= val2) {
      if (val2 === val1) return pct1;
      const ratio = (value - val1) / (val2 - val1);
      return pct1 + ratio * (pct2 - pct1);
    }
  }

  return 50;
}

function computeCompositeScore(
  stats: ParsedStats,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const stat of ALL_STATS) {
    const weight = weights[stat] ?? 0;
    if (!weight) continue;
    total += directionallyAdjustedValue(stat, stats[stat] ?? 0) * weight;
  }
  return total;
}

function findModel(
  classification: NonNullable<ReturnType<typeof classifyStatLine>>,
  model: RankingModel,
): { key: string; entry: RankingModel["models"][string] } | null {
  const candidates: Array<[SeasonType, string]> = [
    [classification.seasonPhase, classification.seasonId],
    [SeasonType.REGULAR_SEASON, classification.seasonId],
    [
      SeasonType.REGULAR_SEASON,
      model.seasonRange.latest || classification.seasonId,
    ],
    [
      SeasonType.REGULAR_SEASON,
      model.seasonRange.earliest || classification.seasonId,
    ],
  ];

  for (const [phase, seasonId] of candidates) {
    const candidateKey = buildModelKey({
      ...classification,
      seasonPhase: phase,
      seasonId,
    });
    const entry = model.models[candidateKey];
    if (entry) {
      return { key: candidateKey, entry };
    }
  }

  // Fallback: find any model with same aggregation + position
  const fallbackEntry = Object.entries(model.models).find(([, entry]) => {
    return (
      entry.aggregationLevel === classification.aggregationLevel &&
      entry.posGroup === classification.posGroup
    );
  });

  if (!fallbackEntry) return null;
  const [fallbackKey, fallbackValue] = fallbackEntry;
  return { key: fallbackKey, entry: fallbackValue };
}

function buildBreakdown(
  stats: ParsedStats,
  entry: RankingModel["models"][string],
): RankingBreakdownEntry[] {
  const relevantStats = getRelevantStats(entry.posGroup);
  return relevantStats.map((stat) => {
    const value = stats[stat] ?? 0;
    const percentile = estimatePercentile(value, entry.distributions[stat]);
    return {
      category: stat,
      value,
      percentile,
      weight: entry.weights[stat] ?? 0,
    };
  });
}

function applyAggregationAdjustments(
  percentile: number,
  classification: NonNullable<ReturnType<typeof classifyStatLine>>,
  entry: RankingModel["models"][string],
): number {
  const isGoaliePlayerDay =
    classification.posGroup === PositionGroup.G &&
    (classification.aggregationLevel === "playerDay" ||
      entry.aggregationLevel === "playerDay");

  if (isGoaliePlayerDay) {
    return percentile + GOALIE_PLAYER_DAY_BOOST;
  }

  return percentile;
}

export function rankPerformance(
  statLine: PlayerStatLine | TeamStatLine,
  model: RankingModel,
): RankingResult {
  const classification = classifyStatLine(statLine);
  if (!classification) {
    throw new Error("Unable to classify stat line for ranking");
  }

  const resolved = findModel(classification, model);
  if (!resolved) {
    throw new Error("No matching ranking model found for stat line");
  }

  const stats = parseStats(statLine);
  const composite = computeCompositeScore(stats, resolved.entry.weights);
  const compositePercentile = estimatePercentile(
    composite,
    resolved.entry.compositeDistribution,
  );
  const adjustedPercentile = applyAggregationAdjustments(
    compositePercentile,
    classification,
    resolved.entry,
  );
  const score = clip(adjustedPercentile, 0, 100);

  return {
    score,
    percentile: adjustedPercentile,
    modelKey: resolved.key,
    seasonId: resolved.entry.seasonId,
    aggregationLevel: resolved.entry.aggregationLevel,
    posGroup: resolved.entry.posGroup,
    seasonPhase: resolved.entry.seasonPhase,
    breakdown: buildBreakdown(stats, resolved.entry),
  };
}

export function rankPerformances(
  statLines: Array<PlayerStatLine | TeamStatLine>,
  model: RankingModel,
): RankingResult[] {
  return statLines.map((line) => rankPerformance(line, model));
}

export function getPerformanceGrade(score: number): string {
  const normalized = clip(score, 0, 120);
  return (
    SCORE_GRADES.find(
      (range) => normalized >= range.min && normalized < range.max,
    )?.grade ?? "Unknown"
  );
}

export function comparePerformances(
  a: RankingResult,
  b: RankingResult,
): { scoreDifference: number; betterPerformance: "a" | "b" | "tie" } {
  const diff = a.score - b.score;
  if (Math.abs(diff) < 0.001) {
    return { scoreDifference: 0, betterPerformance: "tie" };
  }
  return { scoreDifference: diff, betterPerformance: diff > 0 ? "a" : "b" };
}
