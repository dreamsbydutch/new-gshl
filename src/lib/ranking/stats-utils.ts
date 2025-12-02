import type { StatDistribution } from "./types";

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  return (
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    (values.length - 1)
  );
}

export function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function correlation(x: number[], y: number[]): number {
  if (!x.length || x.length !== y.length) return 0;
  const meanX = mean(x);
  const meanY = mean(y);
  const numerator = x.reduce(
    (sum, value, index) => sum + (value - meanX) * (y[index]! - meanY),
    0,
  );
  const denominator = Math.sqrt(
    x.reduce((sum, value) => sum + Math.pow(value - meanX, 2), 0) *
      y.reduce((sum, value) => sum + Math.pow(value - meanY, 2), 0),
  );
  return denominator === 0 ? 0 : numerator / denominator;
}

export function calculatePercentiles(
  sortedValues: number[],
): StatDistribution["percentiles"] {
  const pct = (p: number) => percentile(sortedValues, p);
  return {
    p10: pct(0.1),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
    p95: pct(0.95),
    p99: pct(0.99),
  };
}

export function percentile(values: number[], percentileRank: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileRank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function calculateDistribution(values: number[]): StatDistribution {
  if (!values.length) {
    return {
      mean: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      percentiles: {
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentiles = calculatePercentiles(sorted);

  return {
    mean: mean(values),
    stdDev: standardDeviation(values),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    percentiles,
  };
}

export function isOutlier(
  value: number,
  avg: number,
  stdDev: number,
  threshold: number,
): boolean {
  if (stdDev === 0) return false;
  return Math.abs((value - avg) / stdDev) > threshold;
}

export function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function safeNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
