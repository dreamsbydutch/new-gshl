import type { SerializableRankingModel } from "./aggregation-blend-calculator";

const GOALIE_WIN_FACTOR_BY_AGGREGATION: Record<string, number> = {
  playerDay: 0.05,
  teamDay: 0.07,
  playerWeek: 0.15,
  teamWeek: 0.18,
  playerSplit: 0.4,
  playerTotal: 0.45,
  playerNhl: 0.5,
  teamSeason: 0.5,
};

const DEFAULT_GOALIE_WIN_FACTOR = 0.25;
const GLOBAL_GOALIE_WIN_FACTOR = 0.3;

export function tuneGoalieWinWeights<T extends SerializableRankingModel>(
  model: T,
): T {
  if (!model?.models) {
    return model;
  }

  for (const entry of Object.values(model.models)) {
    if (!entry) continue;
    if (entry.posGroup !== "G") continue;
    if (!entry.weights || typeof entry.weights.W !== "number") continue;

    const aggregationLevel = entry.aggregationLevel ?? "playerDay";
    const factor =
      GOALIE_WIN_FACTOR_BY_AGGREGATION[aggregationLevel] ??
      DEFAULT_GOALIE_WIN_FACTOR;

    entry.weights.W = calculateGoalieWinWeight(entry.weights, factor);
  }

  const goalieWeights = model.globalWeights?.G;
  if (goalieWeights) {
    goalieWeights.W = calculateGoalieWinWeight(
      goalieWeights,
      GLOBAL_GOALIE_WIN_FACTOR,
    );
  }

  return model;
}

function calculateGoalieWinWeight(
  weights: Record<string, number>,
  factor: number,
): number {
  const entries = Object.entries(weights).filter(([key]) => key !== "W");
  const average = entries.length
    ? entries.reduce((sum, [, value]) => sum + value, 0) / entries.length
    : (weights.W ?? 0);

  const baseline = average > 0 ? average : (weights.W ?? 0);
  const target = baseline * factor;
  return Number(Math.max(target, 0).toFixed(4));
}
