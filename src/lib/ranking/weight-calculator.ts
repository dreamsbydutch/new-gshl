import { PositionGroup } from "../types/enums";
import type { ParsedStats, PositionWeights, StatCategory } from "./types";
import { mean, standardDeviation } from "./stats-utils";

export interface WeightAdjustmentOptions {
  scarcityWeights?: Record<string, number>;
  categoryImpactWeights?: Record<string, number>;
}

export const ALL_STATS: StatCategory[] = [
  "G",
  "A",
  "P",
  "PM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SA",
  "SV",
  "SVP",
  "SO",
  "TOI",
];

const POSITION_RELEVANT_STATS: Record<PositionGroup, StatCategory[]> = {
  [PositionGroup.F]: ["G", "A", "P", "PPP", "SOG", "HIT", "BLK", "PM"],
  [PositionGroup.D]: ["G", "A", "P", "PPP", "SOG", "HIT", "BLK", "PM"],
  [PositionGroup.G]: ["W", "GA", "GAA", "SA", "SV", "SVP", "SO", "TOI"],
  [PositionGroup.TEAM]: [
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GA",
    "SA",
    "SV",
    "SVP",
  ],
};

export function getRelevantStats(posGroup: PositionGroup): StatCategory[] {
  return POSITION_RELEVANT_STATS[posGroup] ?? [];
}

const BASE_WEIGHTS: PositionWeights = Object.fromEntries(
  ALL_STATS.map((stat) => [stat, 0]),
) as PositionWeights;

export function calculatePositionWeights(
  statLines: ParsedStats[],
  posGroup: PositionGroup,
  adjustments?: WeightAdjustmentOptions,
): PositionWeights {
  const weights: PositionWeights = { ...BASE_WEIGHTS };
  const relevantStats = getRelevantStats(posGroup);
  if (!statLines.length || !relevantStats.length) return weights;

  for (const stat of relevantStats) {
    const values = statLines.map((line) => line[stat]);
    const avg = mean(values);
    const stdDev = standardDeviation(values);
    let weight = avg > 0 ? Math.max(0.05, stdDev / avg) : 0.05;

    const scarcity = adjustments?.scarcityWeights?.[stat] ?? 1;
    const impact = adjustments?.categoryImpactWeights?.[stat] ?? 1;
    weight *= scarcity * impact;
    weights[stat] = weight;
  }

  normalizeWeights(weights, relevantStats);
  return applyPositionAdjustments(weights, posGroup);
}

export function calculateGlobalWeights(
  seasonWeights: PositionWeights[],
): PositionWeights {
  if (!seasonWeights.length) {
    return { ...BASE_WEIGHTS };
  }

  const aggregate: PositionWeights = { ...BASE_WEIGHTS };

  for (const stat of ALL_STATS) {
    const values = seasonWeights.map((w) => w[stat] ?? 0).filter(Boolean);
    aggregate[stat] = values.length ? mean(values) : 0;
  }

  return aggregate;
}

function normalizeWeights(
  weights: PositionWeights,
  stats: StatCategory[],
): void {
  const total = stats.reduce((sum, stat) => sum + (weights[stat] ?? 0), 0);
  if (!total) return;
  const factor = stats.length / total;
  for (const stat of stats) {
    weights[stat] = Number(((weights[stat] ?? 0) * factor).toFixed(6));
  }
}

export function applyPositionAdjustments(
  weights: PositionWeights,
  posGroup: PositionGroup,
): PositionWeights {
  const adjusted: PositionWeights = { ...weights };

  switch (posGroup) {
    case PositionGroup.F:
      adjusted.G *= 1.1;
      adjusted.PPP *= 1.05;
      break;
    case PositionGroup.D:
      adjusted.BLK *= 1.15;
      adjusted.HIT *= 1.1;
      break;
    case PositionGroup.G:
      adjusted.SVP *= 1.25;
      adjusted.GAA *= 1.1;
      adjusted.W *= 0.9;
      adjusted.GA *= 0.6;
      break;
    case PositionGroup.TEAM:
      adjusted.W *= 1.1;
      adjusted.G *= 1.05;
      adjusted.A *= 1.05;
      adjusted.GA *= 0.8;
      break;
  }

  const relevantStats = getRelevantStats(posGroup);
  normalizeWeights(adjusted, relevantStats);
  // Zero out irrelevant stats to keep downstream math tidy
  for (const stat of ALL_STATS) {
    if (!relevantStats.includes(stat)) {
      adjusted[stat] = 0;
    }
  }

  return adjusted;
}
