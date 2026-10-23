import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";

export interface NhlTalentRateObservation {
  year: number;
  age: number | null;
  minutes: number;
  gar: number;
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
  version: "nhl-conditional-talent-v1";
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
export interface NhlConditionalTalentPrediction {
  nhlPlayerId: number;
  position: NhlTalentPosition | null;
  targetYear: number;
  ratePer60: number | null;
  /** Model uncertainty in latent rate; not a guaranteed injury recovery interval. */
  latentStandardDeviation: number | null;
  lastObservedYear: number | null;
  absentSeasons: number;
  staleSeasons: number;
  observedMinutes: number;
  status: "qualified" | "research" | "unavailable";
}
