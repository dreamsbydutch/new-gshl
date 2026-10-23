export type NhlLineupUsageCandidate =
  | "latest"
  | "weighted3"
  | 1
  | 10
  | 100
  | 1000;
export type NhlLineupUsagePosition = "F" | "D";
export type NhlLineupUsageFeatures = [number, number, number | null, number];
export interface NhlLineupUsageObservation {
  year: number;
  minutes: number;
  games: number;
  age: number | null;
  teams?: readonly string[];
}
export interface NhlLineupUsageLinear {
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
}
export interface NhlLineupUsageMetrics {
  rows: number;
  mse: number | null;
  latestMse: number | null;
  weighted3Mse: number | null;
  mae: number | null;
  latestMae: number | null;
  bias: number | null;
}
export interface NhlLineupUsageValidation extends NhlLineupUsageMetrics {
  origins: number;
  winningOrigins: number;
  shortTargetGames: NhlLineupUsageMetrics;
  regularTargetGames: NhlLineupUsageMetrics;
  lowUsage: NhlLineupUsageMetrics;
  knownTeamChange: NhlLineupUsageMetrics;
  realizedNextTeamChange: NhlLineupUsageMetrics;
  afterAbsence: NhlLineupUsageMetrics;
  unknownAge: NhlLineupUsageMetrics;
}
export interface NhlLineupUsageReference {
  position: NhlLineupUsagePosition;
  candidate: NhlLineupUsageCandidate;
  model: NhlLineupUsageLinear | null;
  trainingRows: number;
  trainingThroughYear: number;
  validation: NhlLineupUsageValidation;
}
export interface NhlLineupUsageArtifact {
  version: "nhl-lineup-usage-v1";
  units: "minutes-per-appearance";
  cutoffYear: number;
  sourceSha256: string;
  method: {
    target: "next-calendar-season-positive-exposure";
    selection: "expanding-origin-error";
    ageMissing: "origin-training-mean";
    featureNames: readonly string[];
    candidates: readonly NhlLineupUsageCandidate[];
    warmupOrigins: number;
    minimumTrainingRows: number;
  };
  references: NhlLineupUsageReference[];
  profiles: {
    nhlPlayerId: number;
    position: NhlLineupUsagePosition;
    observations: NhlLineupUsageObservation[];
  }[];
}
export interface NhlLineupUsageValidationRow {
  nhlPlayerId: number;
  position: NhlLineupUsagePosition;
  originYear: number;
  targetYear: number;
  lastObservedYear: number;
  targetGames: number;
  features: NhlLineupUsageFeatures;
  actual: number;
  predicted: number;
  selected: NhlLineupUsageCandidate;
  trainingRows: number;
  knownTeamChange: boolean;
  realizedNextTeamChange: boolean;
}
export type NhlLineupUsageReason =
  | "no-positive-exposure-history"
  | "unsupported-horizon"
  | "stale-history"
  | "one-season-history"
  | "short-latest-season"
  | "age-unavailable"
  | "limited-role-validation"
  | "invalid-model-output";
export interface NhlLineupUsagePrediction {
  nhlPlayerId: number;
  position: NhlLineupUsagePosition | null;
  targetYear: number;
  minutesPerAppearance: number | null;
  status: "supported" | "research" | "unavailable";
  reasons: NhlLineupUsageReason[];
  lastObservedYear: number | null;
  measuredSeasons: number;
  latestGames: number | null;
}
