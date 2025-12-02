export type SerializableRankingModel = {
  models: Record<string, ModelEntry>;
  globalWeights?: Record<string, Record<string, number>>;
};

type ModelEntry = {
  aggregationLevel?: string;
  posGroup?: string;
  sampleSize?: number;
  compositeDistribution?: {
    mean?: number;
    stdDev?: number;
  };
  weights?: Record<string, number>;
};

export type BlendWeightSet = {
  all: number;
  top5: number;
  top3: number;
  top2: number;
};

export type AggregationBlendWeightsMap = Record<
  string,
  Record<string, BlendWeightSet>
>;

const LOW_VARIANCE_PROFILE: BlendWeightSet = {
  all: 0.65,
  top5: 0.2,
  top3: 0.1,
  top2: 0.05,
};

const HIGH_VARIANCE_PROFILE: BlendWeightSet = {
  all: 0.25,
  top5: 0.25,
  top3: 0.25,
  top2: 0.25,
};

const AGGREGATION_LEVEL_SPIKE_BIAS: Record<string, number> = {
  playerDay: 0.35,
  teamDay: 0.3,
  playerWeek: 0.2,
  teamWeek: 0.15,
  playerSplit: -0.05,
  playerTotal: -0.1,
  playerNhl: -0.15,
  teamSeason: -0.15,
};

const MAX_VOLATILITY = 5;

export function deriveAggregationBlendWeights(
  model: SerializableRankingModel,
): AggregationBlendWeightsMap {
  const aggregationVolatility = new Map<
    string,
    Map<string, { weightedVolatility: number; samples: number }>
  >();

  for (const entry of Object.values(model.models ?? {})) {
    if (!entry) continue;
    const aggregationLevel = entry.aggregationLevel ?? "playerDay";
    const posGroup = entry.posGroup ?? "DEFAULT";
    const sampleSize =
      typeof entry.sampleSize === "number" && entry.sampleSize > 0
        ? entry.sampleSize
        : 0;
    if (!sampleSize) continue;

    const composite = entry.compositeDistribution;
    const mean = composite?.mean ?? 0;
    const stdDev = composite?.stdDev ?? 0;
    if (mean <= 0 || stdDev <= 0) continue;

    const volatility = Math.min(Math.abs(stdDev / mean), MAX_VOLATILITY);
    if (!aggregationVolatility.has(aggregationLevel)) {
      aggregationVolatility.set(aggregationLevel, new Map());
    }

    const posMap = aggregationVolatility.get(aggregationLevel)!;
    const current = posMap.get(posGroup) ?? {
      weightedVolatility: 0,
      samples: 0,
    };
    current.weightedVolatility += volatility * sampleSize;
    current.samples += sampleSize;
    posMap.set(posGroup, current);
  }

  const summaries: Array<{
    aggregationLevel: string;
    posGroup: string;
    avgVol: number;
  }> = [];
  for (const [aggregationLevel, posMap] of aggregationVolatility.entries()) {
    for (const [posGroup, stats] of posMap.entries()) {
      if (!stats.samples) continue;
      summaries.push({
        aggregationLevel,
        posGroup,
        avgVol: stats.weightedVolatility / stats.samples,
      });
    }
  }

  if (!summaries.length) {
    return {};
  }

  const minVol = Math.min(...summaries.map((s) => s.avgVol));
  const maxVol = Math.max(...summaries.map((s) => s.avgVol));
  const denomRaw = maxVol - minVol;
  const denom = denomRaw === 0 ? 1 : denomRaw;

  const result: AggregationBlendWeightsMap = {};

  for (const summary of summaries) {
    const bias = AGGREGATION_LEVEL_SPIKE_BIAS[summary.aggregationLevel] ?? 0;
    const normalized = clamp((summary.avgVol - minVol) / denom + bias, 0, 1);
    const weights = normalizeWeights(interpolateBlendProfiles(normalized));

    if (!result[summary.aggregationLevel]) {
      result[summary.aggregationLevel] = {};
    }

    const aggregationBucket = result[summary.aggregationLevel]!;
    aggregationBucket[summary.posGroup] = weights;
  }

  for (const posWeights of Object.values(result)) {
    const perPosition = Object.entries(posWeights)
      .filter(([key]) => key !== "DEFAULT")
      .map(([, weights]) => weights);

    if (perPosition.length) {
      posWeights.DEFAULT = normalizeWeights(averageWeights(perPosition));
    }
  }

  return result;
}

function interpolateBlendProfiles(value: number): BlendWeightSet {
  return {
    all: lerp(LOW_VARIANCE_PROFILE.all, HIGH_VARIANCE_PROFILE.all, value),
    top5: lerp(LOW_VARIANCE_PROFILE.top5, HIGH_VARIANCE_PROFILE.top5, value),
    top3: lerp(LOW_VARIANCE_PROFILE.top3, HIGH_VARIANCE_PROFILE.top3, value),
    top2: lerp(LOW_VARIANCE_PROFILE.top2, HIGH_VARIANCE_PROFILE.top2, value),
  };
}

function normalizeWeights(weights: BlendWeightSet): BlendWeightSet {
  const total = weights.all + weights.top5 + weights.top3 + weights.top2;
  if (!total) {
    return { ...LOW_VARIANCE_PROFILE };
  }

  const normalized = {
    all: weights.all / total,
    top5: weights.top5 / total,
    top3: weights.top3 / total,
    top2: weights.top2 / total,
  };

  const rounded: BlendWeightSet = {
    all: Number(normalized.all.toFixed(4)),
    top5: Number(normalized.top5.toFixed(4)),
    top3: Number(normalized.top3.toFixed(4)),
    top2: Number(normalized.top2.toFixed(4)),
  };

  const roundingError =
    1 - (rounded.all + rounded.top5 + rounded.top3 + rounded.top2);
  if (Math.abs(roundingError) > 0.0001) {
    const largestKey = Object.entries(rounded).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as keyof BlendWeightSet | undefined;
    if (largestKey) {
      rounded[largestKey] = Number(
        (rounded[largestKey] + roundingError).toFixed(4),
      );
    }
  }

  return rounded;
}

function averageWeights(weights: BlendWeightSet[]): BlendWeightSet {
  const total = weights.length;
  if (!total) return { ...LOW_VARIANCE_PROFILE };

  const sum = weights.reduce(
    (acc, set) => {
      acc.all += set.all;
      acc.top5 += set.top5;
      acc.top3 += set.top3;
      acc.top2 += set.top2;
      return acc;
    },
    { all: 0, top5: 0, top3: 0, top2: 0 },
  );

  return {
    all: sum.all / total,
    top5: sum.top5 / total,
    top3: sum.top3 / total,
    top2: sum.top2 / total,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
