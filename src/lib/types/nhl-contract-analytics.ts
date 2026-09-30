export interface NhlContractAnalyticsInput {
  id: string;
  playerName: string;
  position: string;
  signingDate: number;
  startSeasonStartYear: number;
  expirySeasonStartYear: number;
  length: number;
  seasons: Array<{ seasonStartYear: number; capHit: number }>;
}

export interface NhlRosterAnalyticsPlayer {
  id: string;
  playerName: string;
  position: string;
  nhlTeam: string[];
  contracts: NhlContractAnalyticsInput[];
  historyTruncated: boolean;
  currentProfileContract?: NhlContractAnalyticsInput | null;
}

export interface NhlRosterAnalyticsTeam {
  id: string;
  name: string;
  abbr: string;
}

export interface NormalizedContractSeason {
  seasonStartYear: number;
  capHit: number | null;
  salaryCap: number | null;
  capShare: number | null;
  normalizedSalary: number | null;
  usesContractAav: boolean;
}

export interface NormalizedNhlContract extends NhlContractAnalyticsInput {
  normalizedAav: number | null;
  nominalAav: number | null;
  averageCapShare: number | null;
  missingCapYears: number[];
  missingSalaryYears: number[];
  termNeedsReview: boolean;
  breakdown: NormalizedContractSeason[];
}
