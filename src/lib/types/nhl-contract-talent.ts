export interface NhlContractTalentSeason {
  seasonStartYear: number;
  playerId: string;
  position: "F" | "D" | "G";
  games: number;
  minutes: number;
  teamGames: number | null;
  goalsAboveReplacement: number | null;
  qualification: string;
  /** Complete season and verified official cohort; absence is never inferred. */
  complete: boolean;
  modelVersion?: string;
  sourceId?: string;
  sourceHash?: string;
  sourceFetchedAt?: number;
  age?: number | null;
}

export interface NhlContractTalentYear {
  seasonStartYear: number;
  state: "covered" | "partial" | "missing" | "provisional" | "future";
  goalsAboveReplacement: number | null;
  gar82: number | null;
  qualification: string | null;
  sourceId?: string;
  sourceHash?: string;
  sourceFetchedAt?: number;
}

export interface NhlContractTalentSummary {
  contractId: string;
  playerId: string;
  units: "goals-above-same-position-reference";
  expectedCompletedYears: number[];
  coveredCompletedYears: number[];
  missingYears: number[];
  provisionalYears: number[];
  futureYears: number[];
  expectedYearCount: number;
  coveredYearCount: number;
  /** Known completed years only; null when none are supported. */
  observedDeliveredGoalsAboveReplacement: number | null;
  /** Strict completed-year sum: null if any required past year is unsupported. */
  completedDeliveredGoalsAboveReplacement: number | null;
  /** Equal-year mean, schedule standardized; strict past-year coverage. */
  completedYearsGar82Average: number | null;
  /** Diagnostic mean of covered completed years; coverage must accompany it. */
  coveredCompletedYearsGar82Average: number | null;
  /** Available only after the entire contract has ended with complete coverage. */
  finalContractGar82Average: number | null;
  currentSeason: NhlContractTalentYear | null;
  years: NhlContractTalentYear[];
}
