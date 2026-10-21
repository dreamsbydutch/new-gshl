import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";
import type { NhlTalentPeerAging } from "./nhl-contract-talent-peers";

export interface NhlTalentAgingModel {
  version: "nhl-talent-aging-v1";
  position: NhlTalentPosition;
  /** Ending year of the latest supplied complete official cohort, or null. */
  throughYear: number | null;
  curve: {
    peakAge: number;
    developmentRate: number;
    declineRate: number;
    pairs: number;
    players: number;
    totalWeight: number;
    weightedMse: number;
    minimumAge: number;
    maximumAge: number;
  } | null;
  returnModel: {
    /** intercept, centered age, older-age squared, GAR/10, game share, age-known, GAR-known */
    coefficients: number[];
    rows: number;
    returns: number;
    absences: number;
    ridge: number;
    /** One weak intercept-only Bernoulli(.5) pseudo-observation. */
    interceptPriorWeight: 1;
    iterations: number;
    converged: boolean;
  } | null;
  bounds: { low: number; high: number; samples: number } | null;
  reasons: string[];
}

export interface NhlTalentAgingProjectionInput {
  peerAging?: NhlTalentPeerAging | null;
  /** One-step expected delivered GAR/82, including first-year participation risk. */
  baseline: number;
  /** Observed origin GAR/82, or an explicitly unknown placeholder with garKnown=false. */
  currentGar: number;
  originAge: number | null;
  horizon: number;
  gamesShare: number;
  garKnown: boolean;
}
