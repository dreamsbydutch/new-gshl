export type PerformanceKind =
  | "playerDay"
  | "playerWeek"
  | "playerSplit"
  | "playerTotal"
  | "playerNhl"
  | "teamDay"
  | "teamWeek"
  | "teamSeason"
  | "playerCareer"
  | "teamCareer";

export type PerformanceColumnGroup = "all" | "activity" | "hockey" | "ratings";

export interface PerformanceFilters {
  kind: PerformanceKind;
  seasonIds: string[];
  stat: string;
  direction: "asc" | "desc";
  position: "all" | "skater" | "goalie";
  seasonType: string;
  startDate: string;
  endDate: string;
  minimumGames?: number;
}

export interface PerformanceRow {
  id: string;
  season: string;
  playerId: string | null;
  teamIds: string[];
  weekId: string | null;
  period: string;
  position: string;
  stats: Record<string, number | null>;
  name: string;
  team: string;
  franchiseId?: string;
  ownerId?: string;
  ownerName?: string;
}

export interface PerformanceResult {
  rows: PerformanceRow[];
  highlightsOnly: boolean;
}
