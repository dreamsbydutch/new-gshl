import type {
  NhlContractTalentSeason,
  NhlContractTalentSummary,
} from "./nhl-contract-talent";
import type { NhlContractTalentPrediction } from "./nhl-contract-talent-forecast";
export type NhlContractSort = "salary" | "actual" | "forecast";

export interface NhlContractTalentPopulation {
  seasonStartYear: number;
  currentSeasonStartYear: number;
  populationComplete: boolean;
  teamGames: number | null;
  observations: readonly (NhlContractTalentSeason & {
    nhlPlayerId: number | null;
  })[];
}
export interface NhlContractTalentView {
  actual: NhlContractTalentSummary | null;
  error: string | null;
  forecast: {
    status: "qualified" | "unavailable" | "expired" | "stale";
    averageGar82: number | null;
    originYear: number;
    years: Array<{
      seasonStartYear: number;
      prediction: NhlContractTalentPrediction;
    }>;
    reasons: string[];
  };
}
