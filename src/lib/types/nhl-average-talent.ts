import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";
import type {
  NhlConditionalTalentArtifact,
  NhlConditionalTalentPrediction,
  NhlTalentRateObservation,
} from "./nhl-conditional-talent";

export interface NhlAverageTalentReference {
  year: number;
  position: NhlTalentPosition;
  ratedPlayers: number;
  ratedMinutes: number;
  goalsAboveReplacementPer60: number;
}
export interface NhlAverageTalentWorkload {
  position: NhlTalentPosition;
  standardMinutes: number;
  /** League-wide usage cohort: 12F/6D/1G multiplied by verified NHL club count. */
  rolesPerTeam: number;
  seasons: {
    year: number;
    teamCount: number;
    players: number;
    minutes: number;
    games: number;
    teamGames: number;
  }[];
}
export interface NhlAverageTalentArtifact {
  version: "nhl-average-talent-v1";
  units: "goals-above-average-per-60-minutes";
  baseline: "season-position-exposure-weighted-rated-player";
  cutoffYear: number;
  sourceSha256: string;
  seasonalReferences: NhlAverageTalentReference[];
  workloadPolicy: "latest-three-complete-seasons-top-12F-6D-1G-team-equivalents-by-minutes-v1";
  standardWorkloads: NhlAverageTalentWorkload[];
  references: NhlConditionalTalentArtifact["references"];
  validation: NhlConditionalTalentArtifact["validation"];
  profiles: {
    nhlPlayerId: number;
    position: NhlTalentPosition;
    latestAppearanceYear: number;
    observations: (Omit<NhlTalentRateObservation, "gar"> & {
      goalsAboveAverage: number;
    })[];
  }[];
}
export interface NhlAverageTalentPrediction
  extends Omit<NhlConditionalTalentPrediction, "ratePer60"> {
  rateAboveAveragePer60: number | null;
  /** Position-standard opportunity, not expected availability or personal deployment. */
  standardMinutes: number | null;
  standardSeasonGoalsAboveAverage: number | null;
}
