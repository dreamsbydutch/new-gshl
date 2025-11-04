/**
 * Statistical Utilities
 * ======================
 * Core statistical functions for ranking calculations.
 */

/**
 * Calculate mean (average) of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation of an array of numbers
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate percentile of a value within a dataset
 * @param value - The value to rank
 * @param sortedValues - Array of values sorted in ascending order
 * @returns Percentile (0-100)
 */
export function percentileRank(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;

  // Find position where value would fit
  let rank = 0;
  for (const val of sortedValues) {
    if (val <= value) rank++;
    else break;
  }

  return (rank / sortedValues.length) * 100;
}

/**
 * Get specific percentile value from a sorted dataset
 * @param percentile - Target percentile (0-100)
 * @param sortedValues - Array of values sorted in ascending order
 */
export function getPercentileValue(
  percentile: number,
  sortedValues: number[],
): number {
  if (sortedValues.length === 0) return 0;
  if (percentile <= 0) return sortedValues[0]!;
  if (percentile >= 100) return sortedValues[sortedValues.length - 1]!;

  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[index]!;
}

/**
 * Calculate z-score (standardized score)
 * @param value - The value to standardize
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation of the distribution
 */
export function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Detect outliers using z-score method
 * @param value - The value to check
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation of the distribution
 * @param threshold - Z-score threshold (typically 3)
 */
export function isOutlier(
  value: number,
  mean: number,
  stdDev: number,
  threshold = 3,
): boolean {
  return Math.abs(zScore(value, mean, stdDev)) > threshold;
}

/**
 * Normalize a value to 0-100 scale using min-max normalization
 */
export function normalizeToScale(
  value: number,
  min: number,
  max: number,
): number {
  if (max === min) return 50; // Middle value if no variance
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Clip a value to a specified range
 */
export function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate weighted average
 */
export function weightedAverage(values: number[], weights: number[]): number {
  if (values.length !== weights.length || values.length === 0) return 0;

  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum === 0) return 0;

  const weightedSum = values.reduce(
    (sum, val, i) => sum + val * weights[i]!,
    0,
  );
  return weightedSum / weightSum;
}

/**
 * Sort array and return sorted copy
 */
export function sortAscending(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
export function correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const meanX = mean(x);
  const meanY = mean(y);
  const stdX = standardDeviation(x);
  const stdY = standardDeviation(y);

  if (stdX === 0 || stdY === 0) return 0;

  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += ((x[i]! - meanX) / stdX) * ((y[i]! - meanY) / stdY);
  }

  return sum / x.length;
}

/**
 * Calculate distribution statistics for a dataset
 */
export function calculateDistribution(values: number[]) {
  if (values.length === 0) {
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

  const sorted = sortAscending(values);

  return {
    mean: mean(values),
    stdDev: standardDeviation(values),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    percentiles: {
      p10: getPercentileValue(10, sorted),
      p25: getPercentileValue(25, sorted),
      p50: getPercentileValue(50, sorted),
      p75: getPercentileValue(75, sorted),
      p90: getPercentileValue(90, sorted),
      p95: getPercentileValue(95, sorted),
      p99: getPercentileValue(99, sorted),
    },
  };
}

/**
 * Smooth values using exponential moving average
 */
export function exponentialSmoothing(values: number[], alpha = 0.3): number[] {
  if (values.length === 0) return [];

  const smoothed: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    smoothed.push(alpha * values[i]! + (1 - alpha) * smoothed[i - 1]!);
  }

  return smoothed;
}
