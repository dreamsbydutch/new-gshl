import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";

export interface NhlTalentRateObservation {
  year: number;
  age: number | null;
  minutes: number;
  gar: number;
  /** Actual appearances; absent seasons never supply zero-game measurements. */
  games?: number;
  teams?: readonly string[];
}
export interface NhlTalentAdaptationMetrics {
  rows: number;
  baseMse: number | null;
  adaptiveMse: number | null;
}
export interface NhlTalentAdaptation {
  version: "nhl-sustained-talent-v1";
  trainingThroughYear: number;
  reliabilityMinutes: number;
  selectedWeight: number;
  appliedWeight: number;
  status: "experimental" | "disabled";
  validation: NhlTalentAdaptationMetrics & {
    origins: number;
    changedOrigins: number;
    winningOrigins: number;
    changedRows: number;
    lateGrowth: NhlTalentAdaptationMetrics;
    sustainedDecline: NhlTalentAdaptationMetrics;
    unconfirmedJumps: NhlTalentAdaptationMetrics;
    staleHistory: NhlTalentAdaptationMetrics;
    afterAbsence: NhlTalentAdaptationMetrics;
  };
}
export interface NhlTalentChangeEvidence {
  direction: "growth" | "decline" | null;
  adjustmentPer60: number;
  /** Unordered season affiliation changed; no claim about trade timing or causality. */
  teamSetChanged: boolean | null;
  minutesPerAppearanceChange: number | null;
}
export interface NhlTalentDeploymentLinear {
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
}
export interface NhlTalentDeploymentMetrics {
  rows: number;
  baseMse: number | null;
  calibratedMse: number | null;
}
export interface NhlTalentDeploymentCalibration {
  version: "nhl-talent-deployment-calibration-v1";
  selectedRidge: number;
  model: NhlTalentDeploymentLinear | null;
  trainingThroughYear: number;
  trainingRows: number;
  validation: NhlTalentDeploymentMetrics & {
    origins: number;
    winningOrigins: number;
    sparseHistory: NhlTalentDeploymentMetrics;
    lowUsage: NhlTalentDeploymentMetrics;
    highUsage: NhlTalentDeploymentMetrics;
  };
}
export interface NhlTalentRateParameters {
  observationNoise: number;
  annualVariance: number;
  rateSignalWeight: number;
}
export interface NhlTalentRateReference extends NhlTalentRateParameters {
  position: NhlTalentPosition;
  priorMean: number;
  priorVariance: number;
  /** Annual change = intercept + slope * (midpoint age - 27). */
  aging: [number, number];
  agingPairs: number;
  deploymentCalibration?: NhlTalentDeploymentCalibration;
  adaptation?: NhlTalentAdaptation;
}
export interface NhlTalentRateValidationRow {
  nhlPlayerId: number;
  position: NhlTalentPosition;
  originYear: number;
  targetYear: number;
  gapYears: number;
  minutes: number;
  actual: number;
  predicted: number;
  latestObserved: number;
  positionMean: number;
  selected: NhlTalentRateParameters;
  basePrediction?: number;
  deploymentPrediction?: number;
  adaptiveCandidatePrediction?: number;
}
export interface NhlTalentRateMetrics {
  rows: number;
  origins: number;
  positionMeanWinningOrigins: number;
  mae: number | null;
  mse: number | null;
  latestObservedMse: number | null;
  positionMeanMse: number | null;
  weightedMse: number | null;
  latestObservedWeightedMse: number | null;
  bias: number | null;
  returningAfterAbsence: {
    rows: number;
    mae: number | null;
    bias: number | null;
  };
}
export interface NhlConditionalTalentArtifact {
  version:
    | "nhl-conditional-talent-v1"
    | "nhl-conditional-talent-v2"
    | "nhl-conditional-talent-v3";
  units: "goals-above-replacement-per-60-minutes";
  cutoffYear: number;
  sourceSha256: string;
  references: NhlTalentRateReference[];
  profiles: {
    nhlPlayerId: number;
    position: NhlTalentPosition;
    latestAppearanceYear: number;
    observations: NhlTalentRateObservation[];
  }[];
  validation: { position: NhlTalentPosition; metrics: NhlTalentRateMetrics }[];
}
export type NhlTalentConfidenceReason =
  | "no-rated-history"
  | "experimental-trend"
  | "limited-position-validation"
  | "insufficient-measured-seasons"
  | "insufficient-measured-minutes"
  | "missing-age-evidence"
  | "limited-aging-evidence"
  | "absent-season"
  | "stale-measurement"
  | "future-horizon";

export interface NhlConditionalTalentPrediction {
  nhlPlayerId: number;
  position: NhlTalentPosition | null;
  targetYear: number;
  ratePer60: number | null;
  /** Original filter SD, before deployment calibration; not a forecast or recovery interval. */
  latentStandardDeviation: number | null;
  lastObservedYear: number | null;
  absentSeasons: number;
  staleSeasons: number;
  observedMinutes: number;
  measuredSeasons: number;
  confidenceReasons: NhlTalentConfidenceReason[];
  status: "qualified" | "research" | "unavailable";
  adaptation?: NhlTalentChangeEvidence;
}
