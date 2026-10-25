export interface NhlGoalieUsageObservation {
  year: number;
  dressedGames: number;
  starts: number;
  minutes: number;
}
export interface NhlGoalieUsagePair {
  year: number;
  ids: [number, number];
  games: number;
  minutes: [number, number];
}
export interface NhlGoalieUsageDataset {
  seasons: { year: number; complete: boolean }[];
  profiles: {
    nhlPlayerId: number;
    observations: NhlGoalieUsageObservation[];
  }[];
  pairs: NhlGoalieUsagePair[];
}
export interface NhlGoalieUsageCandidate {
  decay: number;
  priorGames: number;
  transform: "share" | "odds-half" | "odds";
}
export interface NhlGoalieUsageMetrics {
  pairs: number;
  games: number;
  mse: number | null;
  latestMse: number | null;
  fixedMse: number | null;
}
export interface NhlGoalieUsageValidationRow {
  targetYear: number;
  ids: [number, number];
  games: number;
  actual: number;
  predicted: number;
  latest: number;
  fixed: number;
  candidate: NhlGoalieUsageCandidate;
}
export interface NhlGoalieUsageArtifact {
  version: "nhl-goalie-usage-v1";
  units: "conditional-dressed-role-strength";
  cutoffYear: number;
  sourceSha256: string;
  candidate: NhlGoalieUsageCandidate;
  method: "latest-role-retained-after-expanding-origin-comparison";
  validation: NhlGoalieUsageMetrics & {
    origins: number;
    winningOrigins: number;
    recent: NhlGoalieUsageMetrics;
  };
  profiles: NhlGoalieUsageDataset["profiles"];
}
export interface NhlGoalieUsagePrediction {
  nhlPlayerId: number;
  targetYear: number;
  roleWeight: number | null;
  startShareWhenDressed: number | null;
  lastObservedYear: number | null;
  dressedGames: number;
  status: "supported" | "research" | "unavailable";
  reasons: string[];
}
