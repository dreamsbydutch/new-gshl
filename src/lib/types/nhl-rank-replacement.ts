import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";
import type { NhlConditionalTalentPrediction } from "./nhl-conditional-talent";

export interface NhlRankReplacementReference {
  position: NhlTalentPosition;
  rank: number;
  /** Playing ability in physical goal units; no workload enters this ordering. */
  rateAboveAveragePer60: number;
  boundaryPlayerId: number;
  eligiblePlayers: number;
  excludedPlayers: number;
  evidence: "complete-rated-population" | "unrated-organization-players";
}

export interface NhlRankReplacementPrediction
  extends NhlConditionalTalentPrediction {
  abilityRateAboveAveragePer60: number | null;
  replacementRateAboveAveragePer60: number | null;
  replacementRank: number | null;
  /** Missing prospects affect knowledge of the boundary, not observed ability. */
  replacementEvidence: NhlRankReplacementReference["evidence"] | null;
}

export interface NhlRankReplacementCalibration {
  version: "nhl-ranked-replacement-v1";
  units: "goals-above-replacement-per-60-minutes";
  policy: "current-organizations-playing-ability-350F-175D-55G-v1";
  cutoffYear: number;
  targetYear: number;
  sourceSha256: string;
  organizationSeasonId: number;
  organizationUpdatedAt: number;
  /** Exact eligible universe, including exclusions, copied before calibration. */
  population: readonly {
    nhlPlayerId: number;
    position: NhlTalentPosition;
    teamAbbr: string;
    membership: "nhl-roster" | "organization";
    eligibility: "eligible" | "no-projection" | "position-mismatch";
  }[];
  references: Readonly<Record<NhlTalentPosition, NhlRankReplacementReference>>;
  predictions: readonly NhlRankReplacementPrediction[];
}
