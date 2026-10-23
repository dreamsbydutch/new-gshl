import type { NhlTalentAgingModel } from "./nhl-contract-talent-aging";
import type { NhlTalentPeerAging } from "./nhl-contract-talent-peers";
import type { NhlTalentPeerCalibration } from "./nhl-contract-talent-peer-calibration";
/** Regular-season contribution only. No salary, cap or fantasy-category inputs. */
export type NhlTalentPosition = "F" | "D" | "G";
export interface NhlTalentAnnualPlayer {
  nhlPlayerId: number;
  position: NhlTalentPosition;
  games: number;
  minutes: number;
  goalsAboveReplacement: number | null;
  age: number | null;
  /** Optional verified season club set; unordered and not a trade timeline. */
  teams?: readonly string[];
}
export interface NhlTalentAnnualSeason {
  /** Ending year: 2024 means 2023–24. */
  year: number;
  seasonComplete: boolean;
  officialCohortComplete: boolean;
  /** Actual league games × 2 / NHL teams, never the player's own games. */
  teamGames: number;
  modelVersion: string;
  /** Every official positive-GP player; unsupported model values remain null. */
  players: readonly NhlTalentAnnualPlayer[];
}
export interface NhlTalentForecastDataset {
  seasons: readonly NhlTalentAnnualSeason[];
}
export interface NhlTalentForecastMetrics {
  rows: number;
  mse: number | null;
  mae: number | null;
  bias: number | null;
}
export interface NhlTalentForecastValidationRow {
  positionAgingPrediction: number;
  peerTrajectoryPrediction: number;
  peerCalibrationWeight: number;
  nhlPlayerId: number;
  position: NhlTalentPosition;
  originYear: number;
  targetYear: number;
  horizon: number;
  trainingRows: number;
  trainingThroughYear: number;
  ridge: number;
  target: number;
  prediction: number;
  latestObserved: number;
  positionMean: number;
  targetKind: "played-known" | "verified-no-nhl-games";
}
export interface NhlTalentForecastValidation {
  unavailablePredictions: number;
  eligibleRows: number;
  knownTargets: number;
  unknownPositiveGameTargets: number;
  censoredTargets: number;
  verifiedNoNhlGameTargets: number;
  /** Among eligible validation origins with a complete target cohort. */
  coverage: number;
  origins: number;
  model: NhlTalentForecastMetrics;
  latestObserved: NhlTalentForecastMetrics;
  positionMean: NhlTalentForecastMetrics;
  supported: boolean;
  beatsBothBaselines: boolean;
  folds: Array<{
    originYear: number;
    targetYear: number;
    trainingThroughYear: number;
    rows: number;
    ridge: number;
    mse: number;
    latestObservedMse: number;
    positionMeanMse: number;
  }>;
}
export interface NhlTalentForecastModel {
  peerCalibration: NhlTalentPeerCalibration;
  aging: NhlTalentAgingModel;
  position: NhlTalentPosition;
  horizon: number;
  trainingRows: number;
  ridge: number;
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
  validation: NhlTalentForecastValidation;
  residualInterval: {
    nominalCoverage: 0.8;
    low: number;
    high: number;
    samples: number;
    origins: number;
    conditionalOnObservedTargets: true;
  } | null;
}
export interface NhlTalentForecastProfile {
  peerGroup: string | null;
  peerAging: NhlTalentPeerAging | null;
  nhlPlayerId: number;
  position: NhlTalentPosition;
  originYear: number;
  features: number[];
  latestObserved: number;
  knownGarSeasons: number;
  latestAppearanceYear: number;
}
export interface NhlTalentForecastArtifact {
  version: "nhl-contract-talent-peer-trajectory-v3";
  units: "goals-above-same-position-reference-per-82-team-games";
  cutoffYear: number;
  featureNames: readonly string[];
  horizons: number[];
  policy: {
    ridgeCandidates: number[];
    defaultRidge: number;
    lookbackYears: number;
    minimumTrainingRows: number;
    minimumValidationRows: number;
    minimumValidationOrigins: number;
    minimumValidationCoverage: number;
    originPopulation: string;
    qualification: string;
  };
  sourceSeasons: Array<{ year: number; players: number; modelVersion: string }>;
  profiles: NhlTalentForecastProfile[];
  models: NhlTalentForecastModel[];
  warnings: string[];
}
export interface NhlTalentForecastFitResult {
  artifact: NhlTalentForecastArtifact;
  /** Offline audit evidence; not required for application inference. */
  validationRows: NhlTalentForecastValidationRow[];
}
export interface NhlContractTalentPrediction {
  peerAgingWeight: number;
  peerAging: NhlTalentPeerAging | null;
  targetAge: number | null;
  status: "qualified" | "research" | "unavailable";
  nhlPlayerId: number;
  position: NhlTalentPosition | null;
  originYear: number;
  targetYear: number;
  horizon: number;
  units: NhlTalentForecastArtifact["units"];
  /** Expected delivered contribution, including NHL participation/usage risk. */
  valuePer82: number | null;
  interval: { low: number; high: number; nominalCoverage: 0.8 } | null;
  validation: NhlTalentForecastValidation | null;
  reasons: string[];
}
